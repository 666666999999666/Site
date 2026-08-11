import { ValidationError } from "@/lib/errors"

export const DAILY_TIME_ZONE = "Asia/Shanghai"
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/

function datePartsInShanghai(now: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { year: values.year, month: values.month, day: values.day }
}

export function getShanghaiDateKey(now = new Date()): string {
  const { year, month, day } = datePartsInShanghai(now)
  return `${year}-${month}-${day}`
}

export function getShanghaiMonthKey(now = new Date()): string {
  return getShanghaiDateKey(now).slice(0, 7)
}

export function parseDateKey(value: string): { year: number; month: number; day: number } {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) throw new ValidationError("日期必须使用 YYYY-MM-DD 格式")
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ValidationError("日期无效")
  }
  return { year, month, day }
}

export function parseMonthKey(value: string): { year: number; month: number } {
  const match = MONTH_KEY_PATTERN.exec(value)
  if (!match) throw new ValidationError("月份必须使用 YYYY-MM 格式")
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    throw new ValidationError("月份无效")
  }
  return { year, month }
}

export function dateKeyToDatabaseDate(value: string): Date {
  const { year, month, day } = parseDateKey(value)
  return new Date(Date.UTC(year, month - 1, day))
}

export function databaseDateToKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function getCanonicalQuoteDate(value: string): Date {
  const { month, day } = parseDateKey(value)
  return new Date(Date.UTC(2000, month - 1, day))
}

export function canonicalQuoteDateToKey(value: Date | null): string | null {
  if (!value) return null
  return `2000-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
}

export function addDateKeyDays(value: string, days: number): string {
  const date = dateKeyToDatabaseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return databaseDateToKey(date)
}

export function getMonthRange(value: string): { start: Date; end: Date } {
  const { year, month } = parseMonthKey(value)
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

export function formatChineseDate(value: string): string {
  const { year, month, day } = parseDateKey(value)
  return `${year}年${month}月${day}日`
}
