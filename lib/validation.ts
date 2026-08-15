import { ValidationError } from "@/lib/errors"
import type { PostStatusValue } from "@/lib/post-policy"

type JsonObject = Record<string, unknown>

const POST_KEYS = [
  "title", "content", "excerpt", "categoryId", "tags", "coverImage", "draftMetadata",
  "status", "publishedAt",
] as const
const TODO_KEYS = [
  "title", "description", "categoryId", "projectId", "status", "priority", "dueDate",
  "completionCriteria", "subtasks",
] as const
const CATEGORY_CREATE_KEYS = [
  "name", "type", "description", "color", "sortOrder",
] as const
const CATEGORY_UPDATE_KEYS = ["name", "description", "color", "sortOrder"] as const
const PROJECT_KEYS = [
  "title", "description", "tags", "coverImage", "sourceUrl", "demoUrl", "sortOrder",
] as const

export const PUBLIC_SETTING_KEYS = [
  "owner_name",
  "email",
  "home_tagline",
  "home_role",
  "about_intro",
  "about_whatido",
  "about_skills",
  "about_github",
] as const

export type PublicSettingKey = typeof PUBLIC_SETTING_KEYS[number]

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function unicodeLength(value: string): number {
  return Array.from(value).length
}

export async function readJsonObject(request: Request): Promise<JsonObject> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new ValidationError("请求体必须是有效 JSON")
  }
  if (!isObject(value)) throw new ValidationError("请求体必须是 JSON 对象")
  return value
}

function rejectUnknownKeys(value: JsonObject, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new ValidationError(`不支持的字段：${unknown.join(", ")}`)
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  if (typeof value !== "string") throw new ValidationError(`${label}必须是字符串`)
  const result = value.trim()
  if (!result) throw new ValidationError(`${label}必填`)
  if (unicodeLength(result) > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符`)
  }
  return result
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") throw new ValidationError(`${label}必须是字符串`)
  const result = value.trim()
  if (unicodeLength(result) > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符`)
  }
  return result || null
}

function optionalInteger(
  value: unknown,
  label: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ValidationError(`${label}必须是整数`)
  }
  if (value < min || value > max) {
    throw new ValidationError(`${label}必须在 ${min} 到 ${max} 之间`)
  }
  return value
}

export function validateEmptyObject(value: JsonObject): void {
  rejectUnknownKeys(value, [])
}

function optionalNullableInteger(
  value: unknown,
  label: string,
  min: number,
  max: number
): number | null | undefined {
  if (value === null || value === "") return null
  return optionalInteger(value, label, min, max)
}

function optionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${label}无效`)
  }
  return value as T
}

function optionalDate(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") throw new ValidationError(`${label}必须是 ISO 时间字符串`)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new ValidationError(`${label}必须包含时区`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label}无效`)
  return date
}

function optionalUrl(value: unknown, label: string): string | null | undefined {
  const input = optionalString(value, label, 2048)
  if (!input) return input
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new ValidationError(`${label}不是有效 URL`)
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError(`${label}只支持 http 或 https`)
  }
  return url.toString()
}

function optionalUploadPath(value: unknown): string | null | undefined {
  const input = optionalString(value, "封面图片", 255)
  if (!input) return input
  if (!/^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input)) {
    throw new ValidationError("封面图片路径无效")
  }
  return input
}

function optionalTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new ValidationError("标签必须是字符串数组")
  if (value.length > 20) throw new ValidationError("标签不能超过 20 个")

  const tags = value.map((tag) => {
    if (typeof tag !== "string") throw new ValidationError("标签必须是字符串数组")
    const trimmed = tag.trim()
    if (!trimmed) throw new ValidationError("标签不能为空")
    if (trimmed.length > 50) throw new ValidationError("单个标签不能超过 50 个字符")
    return trimmed
  })

  return [...new Set(tags)]
}

function requireAtLeastOneKey(value: JsonObject) {
  if (Object.keys(value).length === 0) throw new ValidationError("没有可更新的字段")
}

export interface PostInput {
  title?: string
  content?: string
  excerpt?: string | null
  categoryId?: string | null
  tags?: string[]
  coverImage?: string | null
  draftMetadata?: JsonObject | null
  status?: PostStatusValue
  publishedAt?: Date | null
}

function optionalJsonObject(
  value: unknown,
  label: string,
  maxBytes: number
): JsonObject | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isObject(value)) throw new ValidationError(`${label}必须是 JSON 对象或 null`)

  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new ValidationError(`${label}必须可序列化为 JSON`)
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
    throw new ValidationError(`${label}不能超过 ${Math.floor(maxBytes / 1024)}KB`)
  }
  return JSON.parse(serialized) as JsonObject
}

function parsePost(value: JsonObject, partial: boolean): PostInput {
  rejectUnknownKeys(value, POST_KEYS)
  if (partial) requireAtLeastOneKey(value)

  const result: PostInput = {}
  if (!partial || value.title !== undefined) {
    result.title = requiredString(value.title, "标题", 200)
  }
  if (value.content !== undefined) {
    if (typeof value.content !== "string") throw new ValidationError("正文必须是字符串")
    if (value.content.length > 2_000_000) throw new ValidationError("正文过长")
    result.content = value.content
  } else if (!partial) {
    result.content = ""
  }
  if (value.excerpt !== undefined) result.excerpt = optionalString(value.excerpt, "摘要", 1000)
  if (value.categoryId !== undefined) result.categoryId = optionalString(value.categoryId, "分区", 128)
  if (value.tags !== undefined) result.tags = optionalTags(value.tags)
  if (value.coverImage !== undefined) result.coverImage = optionalUploadPath(value.coverImage)
  if (value.draftMetadata !== undefined) {
    result.draftMetadata = optionalJsonObject(value.draftMetadata, "草稿 metadata", 64 * 1024)
  }
  if (value.status !== undefined) {
    result.status = optionalEnum(value.status, "文章状态", ["DRAFT", "PUBLISHED"])
  }
  if (value.publishedAt !== undefined) {
    result.publishedAt = optionalDate(value.publishedAt, "发布时间")
  }
  return result
}

export function validatePostCreate(value: JsonObject): Required<Pick<PostInput, "title" | "content">> & PostInput {
  return parsePost(value, false) as Required<Pick<PostInput, "title" | "content">> & PostInput
}

export function validatePostUpdate(value: JsonObject): PostInput {
  return parsePost(value, true)
}

export interface TodoInput {
  title?: string
  description?: string | null
  categoryId?: string | null
  projectId?: string | null
  status?: "TODO" | "DONE"
  priority?: number | null
  dueDate?: Date | null
  completionCriteria?: string | null
  subtasks?: TodoSubtaskInput[]
}

export interface TodoSubtaskInput {
  id?: string
  title: string
  completed?: boolean
  sortOrder?: number
}

function parseTodoSubtask(
  value: unknown,
  partial: boolean,
  allowId = false
): Partial<TodoSubtaskInput> & { title?: string } {
  if (!isObject(value)) throw new ValidationError("子任务必须是 JSON 对象")
  rejectUnknownKeys(value, allowId
    ? ["id", "title", "completed", "sortOrder"]
    : ["title", "completed", "sortOrder"])
  if (partial) requireAtLeastOneKey(value)

  const result: Partial<TodoSubtaskInput> = {}
  if (!partial || value.title !== undefined) {
    result.title = requiredString(value.title, "子任务标题", 300)
  }
  if (allowId && value.id !== undefined) {
    const id = optionalString(value.id, "子任务 ID", 128)
    if (!id) throw new ValidationError("子任务 ID 不能为空")
    result.id = id
  }
  if (value.completed !== undefined) {
    if (typeof value.completed !== "boolean") {
      throw new ValidationError("子任务完成状态必须是布尔值")
    }
    result.completed = value.completed
  }
  if (value.sortOrder !== undefined) {
    result.sortOrder = optionalInteger(value.sortOrder, "子任务排序值", 0, 10_000)
  }
  return result
}

function optionalTodoSubtasks(value: unknown, allowIds: boolean): TodoSubtaskInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new ValidationError("子任务必须是数组")
  if (value.length > 100) throw new ValidationError("子任务不能超过 100 个")

  const subtasks = value.map((subtask) => parseTodoSubtask(subtask, false, allowIds) as TodoSubtaskInput)
  const ids = subtasks.flatMap((subtask) => subtask.id ? [subtask.id] : [])
  if (new Set(ids).size !== ids.length) throw new ValidationError("子任务 ID 不能重复")
  return subtasks
}

function parseTodo(value: JsonObject, partial: boolean): TodoInput {
  rejectUnknownKeys(value, TODO_KEYS)
  if (partial) requireAtLeastOneKey(value)
  const result: TodoInput = {}
  if (!partial || value.title !== undefined) result.title = requiredString(value.title, "标题", 300)
  if (value.description !== undefined) {
    result.description = optionalString(value.description, "描述", 100_000)
  }
  if (value.categoryId !== undefined) result.categoryId = optionalString(value.categoryId, "分区", 128)
  if (value.projectId !== undefined) result.projectId = optionalString(value.projectId, "项目", 128)
  if (value.status !== undefined) {
    result.status = optionalEnum(value.status, "Todo 状态", ["TODO", "DONE"])
  }
  if (value.priority !== undefined) {
    result.priority = optionalNullableInteger(value.priority, "优先级", 0, 2)
  }
  if (value.dueDate !== undefined) result.dueDate = optionalDate(value.dueDate, "截止时间")
  if (value.completionCriteria !== undefined) {
    result.completionCriteria = optionalString(value.completionCriteria, "完成标准", 20_000)
  }
  if (value.subtasks !== undefined) result.subtasks = optionalTodoSubtasks(value.subtasks, partial)
  return result
}

export function validateTodoCreate(value: JsonObject): TodoInput & { title: string } {
  return parseTodo(value, false) as TodoInput & { title: string }
}

export function validateTodoUpdate(value: JsonObject): TodoInput {
  return parseTodo(value, true)
}

export function validateTodoSubtaskCreate(value: JsonObject): TodoSubtaskInput {
  return parseTodoSubtask(value, false) as TodoSubtaskInput
}

export function validateTodoSubtaskUpdate(value: JsonObject): Partial<Omit<TodoSubtaskInput, "id">> {
  return parseTodoSubtask(value, true)
}

export function validateTodoDraft(value: JsonObject): { markDone: boolean } {
  rejectUnknownKeys(value, ["markDone"])
  if (value.markDone !== undefined && typeof value.markDone !== "boolean") {
    throw new ValidationError("完成状态必须是布尔值")
  }
  return { markDone: value.markDone ?? false }
}

export interface CategoryInput {
  name?: string
  type?: "BLOG" | "TODO"
  description?: string | null
  color?: string | null
  sortOrder?: number
}

function parseCategory(value: JsonObject, partial: boolean): CategoryInput {
  rejectUnknownKeys(value, partial ? CATEGORY_UPDATE_KEYS : CATEGORY_CREATE_KEYS)
  if (partial) requireAtLeastOneKey(value)
  const result: CategoryInput = {}
  if (!partial || value.name !== undefined) result.name = requiredString(value.name, "分区名称", 80)
  if (!partial || value.type !== undefined) {
    result.type = optionalEnum(value.type, "分区类型", ["BLOG", "TODO"])
    if (!partial && !result.type) throw new ValidationError("分区类型必填")
  }
  if (value.description !== undefined) {
    result.description = optionalString(value.description, "分区描述", 500)
  }
  if (value.color !== undefined) {
    const color = optionalString(value.color, "分区颜色", 7)
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new ValidationError("分区颜色无效")
    result.color = color
  }
  if (value.sortOrder !== undefined) {
    result.sortOrder = optionalInteger(value.sortOrder, "排序值", -10_000, 10_000)
  }
  return result
}

export function validateCategoryCreate(value: JsonObject): CategoryInput & { name: string; type: "BLOG" | "TODO" } {
  return parseCategory(value, false) as CategoryInput & { name: string; type: "BLOG" | "TODO" }
}

export function validateCategoryUpdate(value: JsonObject): CategoryInput {
  return parseCategory(value, true)
}

export interface ProjectInput {
  title?: string
  description?: string | null
  tags?: string[]
  coverImage?: string | null
  sourceUrl?: string | null
  demoUrl?: string | null
  sortOrder?: number
}

function parseProject(value: JsonObject, partial: boolean): ProjectInput {
  rejectUnknownKeys(value, PROJECT_KEYS)
  if (partial) requireAtLeastOneKey(value)
  const result: ProjectInput = {}
  if (!partial || value.title !== undefined) result.title = requiredString(value.title, "标题", 200)
  if (value.description !== undefined) {
    result.description = optionalString(value.description, "项目描述", 5000)
  }
  if (value.tags !== undefined) result.tags = optionalTags(value.tags)
  if (value.coverImage !== undefined) result.coverImage = optionalUploadPath(value.coverImage)
  if (value.sourceUrl !== undefined) result.sourceUrl = optionalUrl(value.sourceUrl, "源码链接")
  if (value.demoUrl !== undefined) result.demoUrl = optionalUrl(value.demoUrl, "演示链接")
  if (value.sortOrder !== undefined) {
    result.sortOrder = optionalInteger(value.sortOrder, "排序值", -10_000, 10_000)
  }
  return result
}

export function validateProjectCreate(value: JsonObject): ProjectInput & { title: string } {
  return parseProject(value, false) as ProjectInput & { title: string }
}

export function validateProjectUpdate(value: JsonObject): ProjectInput {
  return parseProject(value, true)
}

export function validateSettings(value: JsonObject): Partial<Record<PublicSettingKey, string>> {
  rejectUnknownKeys(value, PUBLIC_SETTING_KEYS)
  if (Object.keys(value).length === 0) throw new ValidationError("没有可保存的设置")

  const result: Partial<Record<PublicSettingKey, string>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") throw new ValidationError(`${key} 必须是字符串`)
    const maxLength = ["about_intro", "about_whatido"].includes(key) ? 5000 : 1000
    if (raw.length > maxLength) throw new ValidationError(`${key} 内容过长`)

    if (key === "about_github" && raw.trim()) {
      result[key] = optionalUrl(raw, "GitHub 链接") ?? ""
    } else if (key === "email" && raw.trim()) {
      const email = raw.trim()
      if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError("邮箱格式无效")
      }
      result[key] = email
    } else {
      result[key as PublicSettingKey] = raw.trim()
    }
  }
  return result
}

export function validateLogin(value: JsonObject): { password: string } {
  rejectUnknownKeys(value, ["password"])
  if (typeof value.password !== "string" || !value.password) {
    throw new ValidationError("密码必填")
  }
  if (value.password.length > 256) throw new ValidationError("密码过长")
  return { password: value.password }
}

export function validatePasswordChange(value: JsonObject): {
  currentPassword: string
  newPassword: string
} {
  rejectUnknownKeys(value, ["currentPassword", "newPassword"])
  if (typeof value.currentPassword !== "string" || !value.currentPassword) {
    throw new ValidationError("当前密码必填")
  }
  if (typeof value.newPassword !== "string") throw new ValidationError("新密码必须是字符串")
  if (value.newPassword.length < 15) throw new ValidationError("新密码至少 15 个字符")
  if (value.newPassword.length > 128) throw new ValidationError("新密码不能超过 128 个字符")
  if (value.newPassword === value.currentPassword) {
    throw new ValidationError("新密码不能与当前密码相同")
  }
  return { currentPassword: value.currentPassword, newPassword: value.newPassword }
}
