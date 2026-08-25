import { z, ZodError } from "zod/v3"
import { prisma } from "./db"
import { createPost } from "./posts"
import { ConflictError, NotFoundError, ValidationError } from "./errors"
import { Prisma } from "./generated/prisma/client"

const TITLE_MAX_LENGTH = 200
const CONTENT_MAX_LENGTH = 100_000
const TAG_MAX_LENGTH = 50
const MAX_TAGS = 20
const MAX_PROJECTS = 50
const MAX_SUBTASKS = 50

const unicodeLength = (value: string) => Array.from(value).length

const trimmedString = (label: string, maxLength: number) => z
  .string({ required_error: `${label}必填`, invalid_type_error: `${label}必须是字符串` })
  .trim()
  .min(1, `${label}必填`)
  .refine((value) => unicodeLength(value) <= maxLength, `${label}不能超过 ${maxLength} 个字符`)

const nullableTrimmedString = (label: string, maxLength: number) => z
  .union([
    z.string({ invalid_type_error: `${label}必须是字符串` })
      .trim()
      .refine((value) => unicodeLength(value) <= maxLength, `${label}不能超过 ${maxLength} 个字符`),
    z.null(),
  ])
  .transform((value) => value === "" ? null : value)

const tagsSchema = z
  .array(trimmedString("标签", TAG_MAX_LENGTH))
  .max(MAX_TAGS, `标签不能超过 ${MAX_TAGS} 个`)
  .transform((tags) => [...new Set(tags)])

const projectIdsSchema = z
  .array(trimmedString("项目 ID", 100))
  .max(MAX_PROJECTS, `关联项目不能超过 ${MAX_PROJECTS} 个`)
  .transform((ids) => [...new Set(ids)])

export const ideaCreateSchema = z.object({
  title: trimmedString("标题", TITLE_MAX_LENGTH),
  content: z
    .string({ required_error: "正文必填", invalid_type_error: "正文必须是字符串" })
    .refine(
      (value) => unicodeLength(value) <= CONTENT_MAX_LENGTH,
      `正文不能超过 ${CONTENT_MAX_LENGTH} 个字符`
    ),
  tags: tagsSchema.default([]),
  projectIds: projectIdsSchema.default([]),
}).strict()

export const ideaUpdateSchema = z.object({
  title: trimmedString("标题", TITLE_MAX_LENGTH).optional(),
  content: z
    .string({ invalid_type_error: "正文必须是字符串" })
    .refine(
      (value) => unicodeLength(value) <= CONTENT_MAX_LENGTH,
      `正文不能超过 ${CONTENT_MAX_LENGTH} 个字符`
    )
    .optional(),
  tags: tagsSchema.optional(),
  projectIds: projectIdsSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: "至少提供一个需要修改的字段",
})

const conversionBase = {
  requestKey: z
    .string({ required_error: "requestKey 必填" })
    .min(8, "requestKey 过短")
    .max(100, "requestKey 过长")
    .regex(/^[A-Za-z0-9._:-]+$/, "requestKey 格式无效"),
}

const blogConversionSchema = z.object({
  ...conversionBase,
  targetType: z.literal("BLOG"),
  title: trimmedString("文章标题", TITLE_MAX_LENGTH),
  content: z
    .string({ required_error: "文章正文必填", invalid_type_error: "文章正文必须是字符串" })
    .refine(
      (value) => unicodeLength(value) <= CONTENT_MAX_LENGTH,
      `文章正文不能超过 ${CONTENT_MAX_LENGTH} 个字符`
    ),
  excerpt: nullableTrimmedString("文章摘要", 1_000).optional().default(null),
  tags: tagsSchema.default([]),
}).strict()

const todoConversionSchema = z.object({
  ...conversionBase,
  targetType: z.literal("TODO"),
  title: trimmedString("任务标题", 300),
  description: nullableTrimmedString("任务描述", CONTENT_MAX_LENGTH).optional().default(null),
  projectId: nullableTrimmedString("项目 ID", 100).optional().default(null),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]).optional().default(null),
  dueDate: z.string().datetime({ offset: true }).nullable().optional().default(null),
  completionCriteria: nullableTrimmedString("完成标准", 5_000).optional().default(null),
  subtasks: z.array(z.object({
    title: trimmedString("子任务标题", 300),
  }).strict()).max(MAX_SUBTASKS, `子任务不能超过 ${MAX_SUBTASKS} 个`).default([]),
}).strict()

export const ideaConversionSchema = z.discriminatedUnion("targetType", [
  blogConversionSchema,
  todoConversionSchema,
])

export const emptyObjectSchema = z.object({}).strict()

export type IdeaCreateInput = z.infer<typeof ideaCreateSchema>
export type IdeaUpdateInput = z.infer<typeof ideaUpdateSchema>
export type IdeaConversionInput = z.infer<typeof ideaConversionSchema>

export function parseIdeaInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  try {
    return schema.parse(input)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(error.issues[0]?.message ?? "Idea 数据无效")
    }
    throw error
  }
}

export function parseIdeaSearchParams(searchParams: URLSearchParams) {
  const allowedKeys = new Set(["q", "tag", "projectId"])
  const unknown = [...searchParams.keys()].filter((key) => !allowedKeys.has(key))
  if (unknown.length > 0) {
    throw new ValidationError(`不支持的查询字段：${[...new Set(unknown)].join(", ")}`)
  }

  const read = (key: string, maxLength: number) => {
    const values = searchParams.getAll(key)
    if (values.length > 1) throw new ValidationError(`${key} 不能重复`)
    const value = values[0]?.trim()
    if (!value) return undefined
    if ([...value].length > maxLength) throw new ValidationError(`${key} 过长`)
    return value
  }

  return {
    q: read("q", 200),
    tag: read("tag", TAG_MAX_LENGTH),
    projectId: read("projectId", 100),
  }
}

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
