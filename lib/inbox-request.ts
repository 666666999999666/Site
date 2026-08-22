import { AppError, ValidationError } from "@/lib/errors"
import type { InboxKindValue, InboxStatusValue } from "@/lib/inbox-view"

type JsonObject = Record<string, unknown>

export class InboxRequestError extends AppError {
  constructor(message: string, code = "INVALID_INBOX_INPUT") {
    super(message, code, 422)
  }
}

function requireObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InboxRequestError("请求体必须是 JSON 对象")
  }
  return value as JsonObject
}

function rejectUnknownKeys(value: JsonObject, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new InboxRequestError(`不支持的字段：${unknown.join(", ")}`)
  }
}

export function validateInboxCaptureBody(value: unknown): {
  rawInput: string
  requestKey: string
} {
  const body = requireObject(value)
  rejectUnknownKeys(body, ["rawInput", "requestKey"])

  if (typeof body.rawInput !== "string") {
    throw new InboxRequestError("原文必须是字符串")
  }
  if (typeof body.requestKey !== "string") {
    throw new InboxRequestError("requestKey 必须是字符串")
  }

  const requestKey = body.requestKey.trim()
  if (!requestKey || Array.from(requestKey).length > 200) {
    throw new InboxRequestError("requestKey 必须为 1 到 200 个字符")
  }

  return { rawInput: body.rawInput, requestKey }
}

function validateEmptyInboxBody(value: unknown): void {
  const body = requireObject(value)
  rejectUnknownKeys(body, [])
}

export function validateInboxRetryBody(value: unknown): void {
  validateEmptyInboxBody(value)
}

export function validateInboxDeleteBody(value: unknown): void {
  validateEmptyInboxBody(value)
}

const KINDS = new Set<InboxKindValue>(["BLOG", "IDEA", "TODO"])
const STATUSES = new Set<InboxStatusValue>(["RECEIVED", "APPLIED", "FAILED"])

export function validateInboxListQuery(searchParams: URLSearchParams): {
  kind?: InboxKindValue
  status?: InboxStatusValue
} {
  const unknown = [...searchParams.keys()].filter((key) => key !== "kind" && key !== "status")
  if (unknown.length > 0) throw new ValidationError(`不支持的查询参数：${unknown.join(", ")}`)
  if (searchParams.getAll("kind").length > 1 || searchParams.getAll("status").length > 1) {
    throw new ValidationError("收件箱查询参数不能重复")
  }

  const kindInput = searchParams.get("kind")
  const statusInput = searchParams.get("status")
  if (kindInput && !KINDS.has(kindInput as InboxKindValue)) {
    throw new ValidationError("收件箱类型无效")
  }
  if (statusInput && !STATUSES.has(statusInput as InboxStatusValue)) {
    throw new ValidationError("收件箱状态无效")
  }

  return {
    kind: kindInput ? kindInput as InboxKindValue : undefined,
    status: statusInput ? statusInput as InboxStatusValue : undefined,
  }
}
