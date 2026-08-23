import type { QuestionRating } from "@/lib/questions/domain"

export type { QuestionRating } from "@/lib/questions/domain"

export type QuestionAttempt = {
  id: string
  answerMarkdown: string | null
  rating: QuestionRating
  mode: "TYPED" | "DIRECT_REVEAL"
  createdAt: string
}

export type QuestionTimelineItem = {
  id: string
  type?: string
  kind?: string
  answerMarkdown?: string | null
  rating?: QuestionRating | null
  mode?: "TYPED" | "DIRECT_REVEAL" | null
  reason?: string | null
  stateBefore?: string | null
  stateAfter?: string | null
  beforeDueAt?: string | null
  afterDueAt?: string | null
  reviewRevision?: number | null
  createdAt?: string
  at?: string
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type QuestionListItem = {
  id: string
  promptMarkdown: string
  enabled: boolean
  ready: boolean
  state: string | null
  dueAt: string | null
  newQueueAt: string | null
  latestRating: QuestionRating | null
  updatedAt: string
}

export type QuestionDetail = QuestionListItem & {
  referenceAnswerMarkdown: string | null
  contentVersion: number
  scheduleVersion: number
  createdAt: string
}

export type QuestionListResponse = {
  items: QuestionListItem[]
  total: number
  page: number
  pageSize: number
  pendingCount: number
}

export type QuestionDetailResponse = {
  question: QuestionDetail
  attempts: QuestionAttempt[]
  timeline: Paginated<QuestionTimelineItem>
}

export type TodaySummary = {
  dueOldCount: number
  newIntroducedToday: number
  newRemaining: number
  totalActions: number
  uniqueQuestions: number
  typedCount: number
  directRevealCount: number
  ratings: Record<QuestionRating, number>
}

export type QuestionPreferences = {
  dailyNewLimit: number
}

export type TodayQuestion = {
  id: string
  promptMarkdown: string
  reviewKey: string
  contentVersion: number
  scheduleVersion: number
}

export type TodayState = "READY" | "WAITING" | "DONE"

export type TodayResponse = {
  summary: TodaySummary
  preferences: QuestionPreferences
  state: TodayState
  nextDueAt?: string
}

export type TodayTransitionResponse = TodayResponse & {
  question?: TodayQuestion
}

export type RevealResponse = {
  referenceAnswerMarkdown: string
  attempts: QuestionAttempt[]
  directReveal?: boolean
  rating?: QuestionRating
  reviewRevision?: number
}

export type RatingResponse = {
  rating?: QuestionRating
  reviewRevision: number
}

export const ratingLabels: Record<QuestionRating, string> = {
  AGAIN: "重来",
  HARD: "困难",
  GOOD: "良好",
  EASY: "简单",
}

export const ratingBilingualLabels: Record<QuestionRating, string> = {
  AGAIN: "重来 Again",
  HARD: "困难 Hard",
  GOOD: "良好 Good",
  EASY: "简单 Easy",
}

export const ratingDescriptions: Record<QuestionRating, string> = {
  AGAIN: "完全没想起来",
  HARD: "想起来了，但很吃力",
  GOOD: "基本掌握",
  EASY: "非常熟练",
}

export function formatQuestionTime(value: string | null | undefined, withDate = true): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    ...(withDate ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function formatQuestionDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function markdownSummary(markdown: string, limit = 150): string {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " [图片] ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " [代码块] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[~*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (plain.length <= limit) return plain || "（空题目）"
  return `${plain.slice(0, limit).trimEnd()}…`
}

export function stateLabel(item: Pick<QuestionListItem, "enabled" | "ready" | "state">): string {
  if (!item.enabled) return "已停用"
  if (!item.ready) return "待补答案"
  const labels: Record<string, string> = {
    NEW: "新题",
    LEARNING: "学习中",
    REVIEW: "复习中",
    RELEARNING: "重学中",
  }
  return item.state ? labels[item.state] ?? item.state : "可复习"
}

export function dueLabel(item: Pick<QuestionListItem, "enabled" | "ready" | "state" | "dueAt" | "newQueueAt">): string {
  if (!item.enabled || !item.ready) return "不在队列"
  if (item.state === "NEW") return item.newQueueAt ? `排队于 ${formatQuestionDateTime(item.newQueueAt)}` : "等待引入"
  if (!item.dueAt) return "待排程"
  const due = new Date(item.dueAt).getTime()
  return due <= Date.now()
    ? `已到期 · ${formatQuestionDateTime(item.dueAt)}`
    : `将到期 · ${formatQuestionDateTime(item.dueAt)}`
}
