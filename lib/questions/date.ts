import {
  addDateKeyDays,
  dateKeyToDatabaseDate,
  getShanghaiDateKey,
} from "@/lib/daily-date"

export interface ShanghaiDayWindow {
  dateKey: string
  reviewDate: Date
  start: Date
  end: Date
}
export function getShanghaiDayWindow(now = new Date()): ShanghaiDayWindow {
  const dateKey = getShanghaiDateKey(now)
  const nextDateKey = addDateKeyDays(dateKey, 1)
  return {
    dateKey,
    reviewDate: dateKeyToDatabaseDate(dateKey),
    start: new Date(`${dateKey}T00:00:00+08:00`),
    end: new Date(`${nextDateKey}T00:00:00+08:00`),
  }
}

export function addHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1000)
}
