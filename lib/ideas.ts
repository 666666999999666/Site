import { prisma } from "./db"
import { createPost } from "./posts"
import { ConflictError, NotFoundError, ValidationError } from "./errors"
import { Prisma } from "./generated/prisma/client"
import type { IdeaCreateInput, IdeaUpdateInput, IdeaConversionInput } from "./ideas-validation"

type IdeaDatabase = typeof prisma | Prisma.TransactionClient

async function ensureProjectsExist(projectIds: string[], database: IdeaDatabase) {
  if (projectIds.length === 0) return
  const count = await database.project.count({ where: { id: { in: projectIds } } })
  if (count !== projectIds.length) throw new ValidationError("部分关联项目不存在")
}

export async function searchIdeas(
  ownerId: string,
  filters: { q?: string; tag?: string; projectId?: string }
) {
  const and: Prisma.IdeaWhereInput[] = []
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { content: { contains: filters.q, mode: "insensitive" } },
      ],
    })
  }
  if (filters.tag) and.push({ tags: { has: filters.tag } })
  if (filters.projectId) and.push({ projects: { some: { id: filters.projectId } } })

  return prisma.idea.findMany({
    where: { ownerId, ...(and.length > 0 ? { AND: and } : {}) },
    include: { projects: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getIdea(ownerId: string, id: string) {
  const idea = await prisma.idea.findFirst({
    where: { id, ownerId },
    include: {
      projects: { orderBy: { sortOrder: "asc" } },
      sourceInboxItem: { select: { id: true, rawInput: true } },
    },
  })
  if (!idea) throw new NotFoundError("Idea 不存在")
  return idea
}

export async function createIdea(ownerId: string, input: IdeaCreateInput) {
  return prisma.$transaction(async (transaction) => {
    await ensureProjectsExist(input.projectIds, transaction)
    return transaction.idea.create({
      data: {
        owner: { connect: { id: ownerId } },
        title: input.title,
        content: input.content,
        tags: input.tags,
        projects: { connect: input.projectIds.map((id) => ({ id })) },
      },
      include: { projects: { orderBy: { sortOrder: "asc" } } },
    })
  })
}

export async function updateIdea(ownerId: string, id: string, input: IdeaUpdateInput) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.idea.findFirst({ where: { id, ownerId }, select: { id: true } })
    if (!existing) throw new NotFoundError("Idea 不存在")
    if (input.projectIds) await ensureProjectsExist(input.projectIds, transaction)

    return transaction.idea.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.projectIds !== undefined
          ? { projects: { set: input.projectIds.map((projectId) => ({ id: projectId })) } }
          : {}),
      },
      include: { projects: { orderBy: { sortOrder: "asc" } } },
    })
  })
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
      : `/admin/todos#todo-${encodeURIComponent(targetId)}`,
  }
}

async function findConversion(ownerId: string, requestKey: string) {
  return prisma.ideaConversion.findUnique({
    where: { ownerId_requestKey: { ownerId, requestKey } },
    select: { id: true, ideaId: true, targetType: true, postId: true, todoId: true },
  })
}

function assertMatchingConversion(
  conversion: Awaited<ReturnType<typeof findConversion>>,
  ideaId: string,
  targetType: "BLOG" | "TODO"
) {
  if (!conversion) return
  if (conversion.ideaId !== ideaId || conversion.targetType !== targetType) {
    throw new ConflictError("requestKey 已用于其他转换")
  }
}

export async function convertIdea(ownerId: string, ideaId: string, input: IdeaConversionInput) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const idea = await transaction.idea.findFirst({
        where: { id: ideaId, ownerId },
        select: { id: true },
      })
      if (!idea) throw new NotFoundError("Idea 不存在")

      const existing = await transaction.ideaConversion.findUnique({
        where: { ownerId_requestKey: { ownerId, requestKey: input.requestKey } },
        select: { id: true, ideaId: true, targetType: true, postId: true, todoId: true },
      })
      assertMatchingConversion(existing, ideaId, input.targetType)
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
          todo: { connect: { id: todo.id } },
        },
        select: { id: true, targetType: true, postId: true, todoId: true },
      })
      return conversionResult(conversion)
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findConversion(ownerId, input.requestKey)
      assertMatchingConversion(existing, ideaId, input.targetType)
      if (existing) return conversionResult(existing)
    }
    throw error
  }
}
