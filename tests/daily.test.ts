import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  addDateKeyDays,
  canonicalQuoteDateToKey,
  dateKeyToDatabaseDate,
  getCanonicalQuoteDate,
  getMonthRange,
  getShanghaiDateKey,
  parseDateKey,
  parseMonthKey,
} from "../lib/daily-date"
import {
  parseDailyQuoteCreate,
  parseDailyQuoteUpdate,
  parseDailySlot,
  parseDailyTaskInput,
  parseQuoteListQuery,
} from "../lib/daily-validation"
import { DAILY_QUOTE_SEED } from "../prisma/seed-data/daily-quotes"

test("daily date helpers use Asia/Shanghai and validate calendar boundaries", () => {
  assert.equal(getShanghaiDateKey(new Date("2026-08-09T15:59:59Z")), "2026-08-09")
  assert.equal(getShanghaiDateKey(new Date("2026-08-09T16:00:00Z")), "2026-08-10")
  assert.deepEqual(parseDateKey("2028-02-29"), { year: 2028, month: 2, day: 29 })
  assert.throws(() => parseDateKey("2026-02-29"), /日期无效/)
  assert.throws(() => parseDateKey("2026-2-09"), /YYYY-MM-DD/)
  assert.deepEqual(parseMonthKey("2026-08"), { year: 2026, month: 8 })
  assert.throws(() => parseMonthKey("2026-13"), /月份无效/)
  assert.equal(addDateKeyDays("2028-02-28", 1), "2028-02-29")
  assert.equal(addDateKeyDays("2028-02-29", 1), "2028-03-01")
  assert.equal(dateKeyToDatabaseDate("2026-08-10").toISOString(), "2026-08-10T00:00:00.000Z")
  assert.equal(getCanonicalQuoteDate("2026-08-10").toISOString(), "2000-08-10T00:00:00.000Z")
  assert.equal(canonicalQuoteDateToKey(getCanonicalQuoteDate("2026-02-28")), "2000-02-28")
  assert.deepEqual(
    Object.values(getMonthRange("2026-12")).map((date) => date.toISOString()),
    ["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]
  )
})

test("daily quote seed covers every leap-year date exactly once", () => {
  assert.equal(DAILY_QUOTE_SEED.length, 366)
  assert.equal(new Set(DAILY_QUOTE_SEED.map((item) => item.quote)).size, 366)
  assert.equal(new Set(DAILY_QUOTE_SEED.map((item) => item.usedDate)).size, 366)
  assert.equal(DAILY_QUOTE_SEED[0].usedDate, "2000-01-01")
  assert.equal(DAILY_QUOTE_SEED.at(-1)?.usedDate, "2000-12-31")
  assert.ok(DAILY_QUOTE_SEED.some((item) => item.usedDate === "2000-02-29"))

  const counts = new Map<string, number>()
  for (const item of DAILY_QUOTE_SEED) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    assert.match(item.normalizedHash, /^[a-f0-9]{64}$/)
  }
  assert.deepEqual([...counts.values()], [61, 61, 61, 61, 61, 61])
})

test("daily quote migration contains the validated seed corpus", () => {
  const migration = readFileSync(
    new URL("../prisma/migrations/20260810120000_daily_top_three/migration.sql", import.meta.url),
    "utf8"
  )
  const escapeSql = (value: string) => value.replaceAll("'", "''")

  for (const item of DAILY_QUOTE_SEED) {
    const row = [
      item.quote,
      item.category,
      item.author,
      item.source,
      item.sourceDetail,
      item.usedDate,
      item.normalizedHash,
    ].map((value) => `'${escapeSql(value)}'`).join(", ")
    assert.ok(migration.includes(`(${row}, TRUE)`), `migration is missing ${item.usedDate}`)
  }
})

test("daily input validation is strict and bounded", () => {
  assert.deepEqual(parseDailyTaskInput({
    date: "2026-08-10",
    title: "  完成测试  ",
    sourceTodoId: null,
    completed: false,
  }), {
    date: "2026-08-10",
    title: "完成测试",
    sourceTodoId: null,
    completed: false,
  })
  assert.throws(() => parseDailyTaskInput({
    date: "2026-08-10",
    title: "任务",
    completed: false,
    unexpected: true,
  }), /Unrecognized key|不支持|unrecognized/i)
  assert.throws(() => parseDailyTaskInput({
    date: "2026-02-29",
    title: "任务",
    completed: false,
  }), /日期/)
  assert.equal(parseDailySlot("1"), 1)
  assert.throws(() => parseDailySlot("4"), /1、2 或 3/)
  assert.equal(parseDailyQuoteCreate({ quote: " 提醒 ", category: " 专注 " }).quote, "提醒")
  assert.throws(() => parseDailyQuoteCreate({ quote: "", category: "专注" }), /不能为空/)
  assert.throws(() => parseDailyQuoteUpdate({}), /没有可更新/)
  assert.deepEqual(parseQuoteListQuery(new URLSearchParams("page=2&pageSize=20&status=active")), {
    page: 2,
    pageSize: 20,
    status: "active",
    query: "",
  })
  assert.throws(
    () => parseQuoteListQuery(new URLSearchParams("page=1&pageSize=100&status=all")),
    /10 到 50/
  )
})
