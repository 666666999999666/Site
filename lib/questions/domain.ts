import { createHash } from "node:crypto"
import { addDateKeyDays, dateKeyToDatabaseDate, getShanghaiDateKey } from "../daily-date"

export const QUESTION_RATINGS = ["AGAIN", "HARD", "GOOD", "EASY"] as const
export type QuestionRating = (typeof QUESTION_RATINGS)[number]

export const QUESTION_CARD_STATES = ["NEW", "LEARNING", "REVIEW", "RELEARNING"] as const
export type QuestionCardState = (typeof QUESTION_CARD_STATES)[number]

export const QUESTION_REVIEW_SOURCES = ["TYPED", "DIRECT_REVEAL"] as const
export type QuestionReviewSource = (typeof QUESTION_REVIEW_SOURCES)[number]

export const QUESTION_REVEAL_MODES = ["TYPED", "DIRECT_REVEAL"] as const
export type QuestionRevealMode = (typeof QUESTION_REVEAL_MODES)[number]

export const QUESTION_RESET_REASONS = [
  "CONTENT_RESET",
  "ANSWER_CLEARED",
  "ANSWER_COMPLETED",
] as const
export type QuestionResetReason = (typeof QUESTION_RESET_REASONS)[number]

export const QUESTION_IMAGE_FIELD_TYPES = ["PROMPT", "REFERENCE"] as const
export type QuestionImageFieldType = (typeof QUESTION_IMAGE_FIELD_TYPES)[number]

export const QUESTION_DEFAULT_DAILY_NEW_LIMIT = 10
export const QUESTION_MIN_DAILY_NEW_LIMIT = 1
export const QUESTION_MAX_DAILY_NEW_LIMIT = 100
export const QUESTION_REVIEW_TICKET_TTL_MS = 2 * 60 * 60 * 1000
export const QUESTION_MAX_MARKDOWN_CODE_POINTS = 100_000
export const QUESTION_SHANGHAI_TIME_ZONE = "Asia/Shanghai"

export const QUESTION_RATING_LABELS: Readonly<Record<QuestionRating, string>> = {
  AGAIN: "重来 Again",
  HARD: "困难 Hard",
  GOOD: "良好 Good",
  EASY: "简单 Easy",
}

export function isQuestionRating(value: unknown): value is QuestionRating {
  return typeof value === "string" && QUESTION_RATINGS.includes(value as QuestionRating)
}

export function isQuestionCardState(value: unknown): value is QuestionCardState {
  return typeof value === "string" && QUESTION_CARD_STATES.includes(value as QuestionCardState)
}

export function normalizeReferenceAnswer(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null
  return value
}

export function hasReferenceAnswer(value: string | null | undefined): value is string {
  return normalizeReferenceAnswer(value) !== null
}

export function determineRevealMode(answerMarkdown: string): QuestionRevealMode {
  return answerMarkdown.trim() === "" ? "DIRECT_REVEAL" : "TYPED"
}

export function createAnswerDigest(answerMarkdown: string): string {
  return createHash("sha256").update(answerMarkdown, "utf8").digest("hex")
}

export function createQuestionTicketExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + QUESTION_REVIEW_TICKET_TTL_MS)
}

export function isQuestionTicketExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function getQuestionReviewDate(reviewedAt: Date): Date {
  return dateKeyToDatabaseDate(getShanghaiDateKey(reviewedAt))
}

export function getQuestionShanghaiDayBounds(now: Date): { start: Date; end: Date } {
  const dateKey = getShanghaiDateKey(now)
  const nextDateKey = addDateKeyDays(dateKey, 1)
  return {
    start: new Date(`${dateKey}T00:00:00+08:00`),
    end: new Date(`${nextDateKey}T00:00:00+08:00`),
  }
}

export function getRemainingQuestionNewLimit(limit: number, introducedToday: number): number {
  return Math.max(0, limit - introducedToday)
}

export function assertQuestionDailyNewLimit(value: number): number {
  if (
    !Number.isInteger(value)
    || value < QUESTION_MIN_DAILY_NEW_LIMIT
    || value > QUESTION_MAX_DAILY_NEW_LIMIT
  ) {
    throw new RangeError(
      `dailyNewLimit must be an integer from ${QUESTION_MIN_DAILY_NEW_LIMIT} to ${QUESTION_MAX_DAILY_NEW_LIMIT}`
    )
  }
  return value
}

export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length
}

export function assertQuestionMarkdown(value: string, field: "prompt" | "reference" | "answer"): string {
  if (value.trim() === "") throw new RangeError(`${field} markdown must not be blank`)
  if (countUnicodeCodePoints(value) > QUESTION_MAX_MARKDOWN_CODE_POINTS) {
    throw new RangeError(`${field} markdown exceeds ${QUESTION_MAX_MARKDOWN_CODE_POINTS} code points`)
  }
  return value
}
