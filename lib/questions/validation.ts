import { z, ZodError } from "zod"
import { ValidationError } from "@/lib/errors"

export const QUESTION_TEXT_MAX_LENGTH = 100_000
export const QUESTION_PAGE_SIZE = 20
export const DEFAULT_DAILY_NEW_LIMIT = 10
export const MIN_DAILY_NEW_LIMIT = 1
export const MAX_DAILY_NEW_LIMIT = 100

const unicodeLength = (value: string) => Array.from(value).length

const boundedMarkdown = (label: string) => z
  .string({ required_error: `${label}必填`, invalid_type_error: `${label}必须是字符串` })
  .refine(
    (value) => unicodeLength(value) <= QUESTION_TEXT_MAX_LENGTH,
    `${label}不能超过 ${QUESTION_TEXT_MAX_LENGTH} 个字符`
  )

const promptMarkdown = boundedMarkdown("题目")
  .transform((value) => value.trim())
  .refine(Boolean, "题目必填")

const referenceAnswerMarkdown = z
  .union([boundedMarkdown("标准答案"), z.null()])
  .transform((value) => {
    if (value === null) return null
    return value.trim() === "" ? null : value
  })

const positiveVersion = z
  .number({ invalid_type_error: "版本必须是整数" })
  .int("版本必须是整数")
  .min(0, "版本无效")

const rating = z.enum(["AGAIN", "HARD", "GOOD", "EASY"], {
  errorMap: () => ({ message: "评分无效" }),
})

export const questionCreateSchema = z.object({
  promptMarkdown,
  referenceAnswerMarkdown,
}).strict()

const editContentSchema = z.object({
  operation: z.literal("EDIT_CONTENT"),
  promptMarkdown,
  referenceAnswerMarkdown,
  schedulePolicy: z.enum(["KEEP", "RESET"]).nullable(),
  expectedContentVersion: positiveVersion,
  expectedScheduleVersion: positiveVersion,
}).strict()

const setEnabledSchema = z.object({
  operation: z.literal("SET_ENABLED"),
  enabled: z.boolean({ invalid_type_error: "启用状态必须是布尔值" }),
}).strict()

export const questionPatchSchema = z.discriminatedUnion("operation", [
  editContentSchema,
  setEnabledSchema,
])

export const questionPreferencePatchSchema = z.object({
  dailyNewLimit: z
    .number({ required_error: "每日新题上限必填", invalid_type_error: "每日新题上限必须是整数" })
    .int("每日新题上限必须是整数")
    .min(MIN_DAILY_NEW_LIMIT, `每日新题上限不能小于 ${MIN_DAILY_NEW_LIMIT}`)
    .max(MAX_DAILY_NEW_LIMIT, `每日新题上限不能大于 ${MAX_DAILY_NEW_LIMIT}`),
}).strict()

export const revealSchema = z.object({
  answerMarkdown: boundedMarkdown("我的答案"),
  expectedContentVersion: positiveVersion,
  expectedScheduleVersion: positiveVersion,
}).strict()

const ratingCreateSchema = z.object({
  operation: z.literal("CREATE"),
  answerMarkdown: boundedMarkdown("我的答案"),
  rating,
  expectedContentVersion: positiveVersion,
  expectedScheduleVersion: positiveVersion,
}).strict()

const ratingReviseSchema = z.object({
  operation: z.literal("REVISE"),
  rating,
  expectedReviewRevision: positiveVersion,
}).strict()

export const ratingRequestSchema = z.discriminatedUnion("operation", [
  ratingCreateSchema,
  ratingReviseSchema,
])

export const emptyObjectSchema = z.object({}).strict()

export type QuestionCreateInput = z.infer<typeof questionCreateSchema>
export type QuestionPatchInput = z.infer<typeof questionPatchSchema>
export type QuestionPreferencePatchInput = z.infer<typeof questionPreferencePatchSchema>
export type RevealInput = z.infer<typeof revealSchema>
export type RatingRequestInput = z.infer<typeof ratingRequestSchema>
export type QuestionRatingInput = z.infer<typeof rating>

export function parseQuestionInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  try {
    return schema.parse(input)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(error.issues[0]?.message ?? "题目数据无效")
    }
    throw error
  }
}

export type QuestionListStatus = "READY" | "DUE" | "FUTURE" | "NEW" | "PENDING" | "DISABLED"
export type QuestionListRating = "NONE" | QuestionRatingInput

function singleQueryValue(searchParams: URLSearchParams, key: string): string | undefined {
  const values = searchParams.getAll(key)
  if (values.length > 1) throw new ValidationError(`${key} 不能重复`)
  return values[0]
}

export function parseQuestionListQuery(searchParams: URLSearchParams) {
  const allowed = new Set(["page", "q", "status", "rating"])
  const unknown = [...searchParams.keys()].filter((key) => !allowed.has(key))
  if (unknown.length > 0) {
    throw new ValidationError(`不支持的查询字段：${[...new Set(unknown)].join(", ")}`)
  }

  const rawPage = singleQueryValue(searchParams, "page")
  const page = rawPage === undefined ? 1 : Number(rawPage)
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    throw new ValidationError("page 必须是正整数")
  }

  const query = singleQueryValue(searchParams, "q")?.trim() || undefined
  if (query && unicodeLength(query) > 200) throw new ValidationError("q 不能超过 200 个字符")

  const rawStatus = singleQueryValue(searchParams, "status")?.trim().toUpperCase()
  const statuses: QuestionListStatus[] = ["READY", "DUE", "FUTURE", "NEW", "PENDING", "DISABLED"]
  if (rawStatus && !statuses.includes(rawStatus as QuestionListStatus)) {
    throw new ValidationError("status 无效")
  }

  const rawRating = singleQueryValue(searchParams, "rating")?.trim().toUpperCase()
  const ratings: QuestionListRating[] = ["NONE", "AGAIN", "HARD", "GOOD", "EASY"]
  if (rawRating && !ratings.includes(rawRating as QuestionListRating)) {
    throw new ValidationError("rating 无效")
  }

  return {
    page,
    query,
    status: rawStatus as QuestionListStatus | undefined,
    rating: rawRating as QuestionListRating | undefined,
  }
}

export function parseHistoryQuery(searchParams: URLSearchParams) {
  const allowed = new Set(["page"])
  const unknown = [...searchParams.keys()].filter((key) => !allowed.has(key))
  if (unknown.length > 0) throw new ValidationError(`不支持的查询字段：${unknown.join(", ")}`)
  const rawPage = singleQueryValue(searchParams, "page")
  const page = rawPage === undefined ? 1 : Number(rawPage)
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    throw new ValidationError("page 必须是正整数")
  }
  return { page }
}

export function parseReviewKey(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError("reviewKey 无效")
  }
  return value.toLowerCase()
}
