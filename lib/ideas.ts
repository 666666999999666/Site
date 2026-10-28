import { ideaConversionDigest } from "./idea-conversion-key"
import { prisma } from "./db"
import { createPost } from "./posts"
import { ConflictError, NotFoundError, ValidationError } from "./errors"
import { Prisma } from "./generated/prisma/client"
import type { MaterialStatus } from "./material-status"
import type { IdeaCreateInput, IdeaUpdateInput, IdeaConversionInput } from "./ideas-validation"

type IdeaDatabase = typeof prisma | Prisma.TransactionClient

async function ensureProjectsExist(projectIds: string[], database: IdeaDatabase) {
  if (projectIds.length === 0) return
  const count = await database.project.count({ where: { id: { in: projectIds } } })
  if (count !== projectIds.length) throw new ValidationError("部分关联项目不存在")
}

export async function searchIdeas(
  ownerId: string,
  filters: { q?: string; tag?: string; projectId?: string; discussionStatus?: MaterialStatus; take?: number }
) {
  const and: Prisma.IdeaWhereInput[] = []
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { content: { contains: filters.q, mode: "insensitive" } },
        { rawInput: { contains: filters.q, mode: "insensitive" } },
        { discussionSummary: { contains: filters.q, mode: "insensitive" } },
      ],
    })
  }
  if (filters.discussionStatus) and.push({ discussionStatus: filters.discussionStatus })
  if (filters.tag) and.push({ tags: { has: filters.tag } })
  if (filters.projectId) and.push({ projects: { some: { id: filters.projectId } } })

  return prisma.idea.findMany({
    where: { ownerId, ...(and.length > 0 ? { AND: and } : {}) },
    include: { projects: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
    ...(filters.take !== undefined ? { take: Math.min(101, Math.max(1, Math.trunc(filters.take))) } : {}),
  })
}

export async function getIdea(ownerId: string, id: string) {
  const idea = await prisma.idea.findFirst({
    where: { id, ownerId },
    include: {
      projects: { orderBy: { sortOrder: "asc" } },
      sourceInboxItem: { select: { id: true, rawInput: true, source: true, createdAt: true } },
      conversions: { orderBy: { createdAt: "desc" }, include: { post: { select: { id: true, title: true } }, todo: { select: { id: true, title: true } } } },
    },
  })
  if (!idea) throw new NotFoundError("Idea 不存在")
  return idea
}

export async function createIdea(ownerId: string, input: IdeaCreateInput, database?: Prisma.TransactionClient) {
  const run = async (transaction: Prisma.TransactionClient) => {
    await ensureProjectsExist(input.projectIds, transaction)
    return transaction.idea.create({
      data: {
        owner: { connect: { id: ownerId } },
        title: input.title,
        content: input.content,
        rawInput: input.rawInput ?? input.content,
        source: input.source ?? "manual",
        discussionStatus: input.discussionStatus ?? "STORED",
        discussionSummary: input.discussionSummary,
        tags: input.tags,
        projects: { connect: input.projectIds.map((id) => ({ id })) },
      },
      include: { projects: { orderBy: { sortOrder: "asc" } } },
    })
  }
  return database ? run(database) : prisma.$transaction(run)
}

export async function updateIdea(ownerId: string, id: string, input: IdeaUpdateInput, database?: Prisma.TransactionClient) {
  const run = async (transaction: Prisma.TransactionClient) => {
    const existing = await transaction.idea.findFirst({ where: { id, ownerId }, select: { id: true } })
    if (!existing) throw new NotFoundError("Idea 不存在")
    if (input.projectIds) await ensureProjectsExist(input.projectIds, transaction)

    return transaction.idea.update({
      where: { id },
      data: {
        ...(input.discussionStatus !== undefined ? { discussionStatus: input.discussionStatus } : {}),
        ...(input.discussionSummary !== undefined ? { discussionSummary: input.discussionSummary } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.projectIds !== undefined
          ? { projects: { set: input.projectIds.map((projectId) => ({ id: projectId })) } }
          : {}),
      },
      include: { projects: { orderBy: { sortOrder: "asc" } } },
    })
  }
  return database ? run(database) : prisma.$transaction(run)
}

export async function deleteIdea(ownerId: string, id: string) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.idea.findFirst({ where: { id, ownerId }, select: { id: true } })
    if (!existing) throw new NotFoundError("Idea 不存在")
    await transaction.idea.delete({ where: { id } })
    return { ok: true as const }
  })
}

function conversionResult(conversion: {
  id: string
  targetType: "BLOG" | "TODO"
  postId: string | null
  todoId: string | null
}) {
  const targetId = conversion.targetType === "BLOG" ? conversion.postId : conversion.todoId
  if (!targetId) throw new ConflictError("转换记录缺少正式目标")
  return {
    conversionId: conversion.id,
    targetType: conversion.targetType,
    targetId,
    href: conversion.targetType === "BLOG"
      ? `/admin/posts/${encodeURIComponent(targetId)}`
      : `/admin/todos?status=ALL#todo-${encodeURIComponent(targetId)}`,
  }
}

async function findConversion(ownerId: string, requestKey: string) {
  return prisma.ideaConversion.findUnique({
    where: { ownerId_requestKey: { ownerId, requestKey } },
    select: { id: true, ideaId: true, targetType: true, postId: true, todoId: true, inputDigest: true },
  })
}

function assertMatchingConversion(
  conversion: Awaited<ReturnType<typeof findConversion>>,
  ideaId: string,
  targetType: "BLOG" | "TODO",
  inputDigest: string
) {
  if (!conversion) return
  if (conversion.ideaId !== ideaId || conversion.targetType !== targetType || (conversion.inputDigest && conversion.inputDigest !== inputDigest)) {
    throw new ConflictError("requestKey 已用于其他转换或不同内容；请先检查已有目标")
  }
}

export async function convertIdea(ownerId: string, ideaId: string, input: IdeaConversionInput, database?: Prisma.TransactionClient) {
  const inputDigest = ideaConversionDigest(input)
  const run = async (transaction: Prisma.TransactionClient) => {
      const idea = await transaction.idea.findFirst({
        where: { id: ideaId, ownerId },
        select: { id: true },
      })
      if (!idea) throw new NotFoundError("Idea 不存在")

      const existing = await transaction.ideaConversion.findUnique({
        where: { ownerId_requestKey: { ownerId, requestKey: input.requestKey } },
        select: { id: true, ideaId: true, targetType: true, postId: true, todoId: true, inputDigest: true },
      })
      assertMatchingConversion(existing, ideaId, input.targetType, inputDigest)
      if (existing) return conversionResult(existing)

      if (input.targetType === "BLOG") {
        const post = await createPost({
          title: input.title,
          content: input.content,
          excerpt: input.excerpt,
          categoryId: null,
          tags: input.tags,
          status: "DRAFT",
          publishedAt: null,
        }, transaction)
        const conversion = await transaction.ideaConversion.create({
          data: {
            owner: { connect: { id: ownerId } },
            idea: { connect: { id: ideaId } },
            targetType: "BLOG",
            requestKey: input.requestKey,
            inputDigest,
            post: { connect: { id: post.id } },
          },
          select: { id: true, targetType: true, postId: true, todoId: true },
        })
        return conversionResult(conversion)
      }

      if (input.projectId) await ensureProjectsExist([input.projectId], transaction)
      const todo = await transaction.todo.create({
        data: {
          title: input.title,
          description: input.description,
          categoryId: null,
          status: "TODO",
          priority: input.priority,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          projectId: input.projectId,
          completionCriteria: input.completionCriteria,
          subtasks: {
            create: input.subtasks.map((subtask, index) => ({
              title: subtask.title,
              completed: false,
              sortOrder: index,
            })),
          },
        },
      })
      const conversion = await transaction.ideaConversion.create({
        data: {
          owner: { connect: { id: ownerId } },
          idea: { connect: { id: ideaId } },
          targetType: "TODO",
          requestKey: input.requestKey,
          inputDigest,
          todo: { connect: { id: todo.id } },
        },
        select: { id: true, targetType: true, postId: true, todoId: true },
      })
      return conversionResult(conversion)
  }
  if (database) return run(database)
  try {
    return await prisma.$transaction(run)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findConversion(ownerId, input.requestKey)
      assertMatchingConversion(existing, ideaId, input.targetType, inputDigest)
      if (existing) return conversionResult(existing)
    }
    throw error
  }
}
