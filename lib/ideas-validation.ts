import { z, ZodError } from "zod/v3"
import { MATERIAL_STATUSES } from "./material-status"
import { ValidationError } from "./errors"

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
  rawInput: z.string().max(200_000).optional(),
  source: trimmedString("来源", 200).optional(),
  discussionStatus: z.enum(MATERIAL_STATUSES).optional(),
  discussionSummary: nullableTrimmedString("讨论摘要", 10_000).optional(),
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
  discussionStatus: z.enum(MATERIAL_STATUSES).optional(),
  discussionSummary: nullableTrimmedString("讨论摘要", 10_000).optional(),
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
  const allowedKeys = new Set(["q", "tag", "projectId", "discussionStatus"])
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

  const discussionStatus = read("discussionStatus", 30)
  if (discussionStatus && !MATERIAL_STATUSES.includes(discussionStatus as typeof MATERIAL_STATUSES[number])) {
    throw new ValidationError("讨论状态无效")
  }
  return {
    ...(discussionStatus ? { discussionStatus: discussionStatus as typeof MATERIAL_STATUSES[number] } : {}),
    q: read("q", 200),
    tag: read("tag", TAG_MAX_LENGTH),
    projectId: read("projectId", 100),
  }
}
