import { z } from "zod/v3"
import { ValidationError } from "@/lib/errors"
import { parseDateKey, parseMonthKey } from "@/lib/daily-date"

const dateKeySchema = z.string().refine((value) => {
  try {
    parseDateKey(value)
    return true
  } catch {
    return false
  }
}, "日期必须是有效的 YYYY-MM-DD")

const monthKeySchema = z.string().refine((value) => {
  try {
    parseMonthKey(value)
    return true
  } catch {
    return false
  }
}, "月份必须是有效的 YYYY-MM")

const nullableText = (max: number) => z.union([
  z.string().max(max).transform((value) => value.trim() || null),
  z.null(),
]).optional()

const dailyQuoteBaseSchema = z.object({
  quote: z.string().trim().min(1, "提醒语不能为空").max(500, "提醒语不能超过 500 个字符"),
  category: z.string().trim().min(1, "分类不能为空").max(32, "分类不能超过 32 个字符"),
  author: nullableText(120),
  source: nullableText(200),
  sourceDetail: nullableText(200),
  status: z.boolean().optional(),
})

export const dailyTaskInputSchema = z.object({
  date: dateKeySchema,
  title: z.string().max(300, "事项不能超过 300 个字符").transform((value) => value.trim()),
  sourceTodoId: z.union([
    z.string().trim().min(1).max(128),
    z.null(),
  ]).optional(),
  completed: z.boolean(),
}).strict()

export const dailyQuoteCreateSchema = dailyQuoteBaseSchema.strict()

export const dailyQuoteUpdateSchema = dailyQuoteBaseSchema.partial().extend({
  replacementQuoteId: z.number().int().positive().nullable().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "没有可更新的字段"
)

export type DailyTaskInput = z.infer<typeof dailyTaskInputSchema>
export type DailyQuoteCreateInput = z.infer<typeof dailyQuoteCreateSchema>
export type DailyQuoteUpdateInput = z.infer<typeof dailyQuoteUpdateSchema>

export function parseDailyTaskInput(value: unknown): DailyTaskInput {
  return parseSchema(dailyTaskInputSchema, value)
}

export function parseDailyQuoteCreate(value: unknown): DailyQuoteCreateInput {
  return parseSchema(dailyQuoteCreateSchema, value)
}

export function parseDailyQuoteUpdate(value: unknown): DailyQuoteUpdateInput {
  return parseSchema(dailyQuoteUpdateSchema, value)
}

export function parseDailyDateQuery(value: string | null, fallback: string): string {
  return parseSchema(dateKeySchema, value ?? fallback)
}

export function parseDailyMonthQuery(value: string | null, fallback: string): string {
  return parseSchema(monthKeySchema, value ?? fallback)
}

export function parseDailySlot(value: string): 1 | 2 | 3 {
  const slot = Number(value)
  if (slot !== 1 && slot !== 2 && slot !== 3) {
    throw new ValidationError("事项位置必须是 1、2 或 3")
  }
  return slot
}

export function parseDailyQuoteId(value: string): number {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("提醒语 ID 无效")
  return id
}

export function parseQuoteListQuery(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page") ?? "1")
  const pageSize = Number(searchParams.get("pageSize") ?? "20")
  const status = searchParams.get("status") ?? "all"
  const query = (searchParams.get("query") ?? "").trim()
  if (!Number.isInteger(page) || page < 1 || page > 10_000) {
    throw new ValidationError("页码无效")
  }
  if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 50) {
    throw new ValidationError("每页数量必须在 10 到 50 之间")
  }
  if (!(["all", "active", "inactive"] as const).includes(status as "all")) {
    throw new ValidationError("提醒语状态筛选无效")
  }
  if (query.length > 100) throw new ValidationError("搜索内容不能超过 100 个字符")
  return { page, pageSize, status: status as "all" | "active" | "inactive", query }
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "参数无效")
  }
  return result.data
}
