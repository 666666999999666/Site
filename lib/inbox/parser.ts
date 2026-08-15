import { createHash } from "node:crypto"

export const INBOX_PARSER_VERSION = 1
export const MAX_INBOX_RAW_CHARACTERS = 100_000

export type ParsedInboxKind = "BLOG" | "IDEA" | "TODO"

export interface ParsedInboxInput {
  kind: ParsedInboxKind
  parsedBody: string
  parserVersion: number
}

export type InboxInputErrorCode =
  | "INVALID_PREFIX_OR_BODY"
  | "INPUT_TOO_LONG"
  | "INVALID_REQUEST_KEY"

export class InboxInputError extends Error {
  readonly code: InboxInputErrorCode

  constructor(code: InboxInputErrorCode, message: string) {
    super(message)
    this.name = "InboxInputError"
    this.code = code
  }
}

const PREFIX_PATTERN = /^\uFEFF?\s*(idea|文章|todo)[ \t]*[:：]/iu

function codePointLength(value: string) {
  return Array.from(value).length
}

export function parseInboxInput(rawInput: string): ParsedInboxInput {
  if (typeof rawInput !== "string" || codePointLength(rawInput) > MAX_INBOX_RAW_CHARACTERS) {
    throw new InboxInputError("INPUT_TOO_LONG", "输入内容不能超过 100,000 个字符")
  }

  const match = PREFIX_PATTERN.exec(rawInput)
  if (!match) {
    throw new InboxInputError(
      "INVALID_PREFIX_OR_BODY",
      "请输入以 idea：、文章：或 todo：开头的内容"
    )
  }

  const parsedBody = rawInput.slice(match[0].length).trim()
  if (!parsedBody) {
    throw new InboxInputError("INVALID_PREFIX_OR_BODY", "前缀后需要填写内容")
  }

  const prefix = match[1].toLowerCase()
  const kind: ParsedInboxKind = prefix === "文章"
    ? "BLOG"
    : prefix === "idea"
      ? "IDEA"
      : "TODO"

  return {
    kind,
    parsedBody,
    parserVersion: INBOX_PARSER_VERSION,
  }
}

export function createInboxRawHash(rawInput: string) {
  return createHash("sha256").update(rawInput, "utf8").digest("hex")
}

export function assertInboxRequestKey(requestKey: string) {
  const value = requestKey.trim()
  if (!value || value.length > 200) {
    throw new InboxInputError("INVALID_REQUEST_KEY", "requestKey 必须为 1 到 200 个字符")
  }
  return value
}
