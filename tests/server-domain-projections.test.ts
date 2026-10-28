import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import path from "node:path"
import test from "node:test"
import * as dates from "../lib/daily-date"
import * as dailyPolicy from "../lib/daily-policy"
import * as todosPolicy from "../lib/todos-policy"
import * as errors from "../lib/errors"
import { loadRoute } from "./helpers/load-route"

const root = path.resolve(import.meta.dirname, "..")
const at = new Date("2026-08-10T04:00:00Z")

function dailyService(prisma: unknown) {
  return loadRoute<typeof import("../lib/daily")>(path.join(root, "lib/daily.ts"), {
    "node:crypto": { createHash },
    "@/lib/db": { prisma },
    "@/lib/daily-date": dates,
    "@/lib/daily-policy": dailyPolicy, "@/lib/todos-policy": todosPolicy,
    "@/lib/errors": errors,
    "@/lib/generated/prisma/client": { Prisma: {} },
  })
}

for (const quoteId of [17, null]) {
  test(`Daily current day and history preserve the same stored snapshot (quoteId ${quoteId})`, async () => {
    const snapshot = {
      id: "plan", userId: "owner", planDate: new Date("2026-08-10T00:00:00Z"),
      quoteId, quoteText: "historical text", quoteCategory: "historical category",
      quoteAuthor: null, quoteSource: "historical source", quoteSourceDetail: "historical detail",
      tasks: [
        { id: "third", slot: 3, title: "third", completedAt: at, sourceTodoId: "todo" },
        { id: "first", slot: 1, title: "first", completedAt: null, sourceTodoId: null },
      ],
    }
    const calls: unknown[] = []
    const service = dailyService({ dailyPlan: {
      findUnique: async (query: unknown) => { calls.push(query); return snapshot },
      findMany: async (query: unknown) => { calls.push(query); return [snapshot] },
    }, dailyQuote: { findFirst: () => { throw new Error("must not reload today's quote") } } })
    const day = await service.getDailyDay("owner", "2026-08-10")
    const history = await service.getDailyHistory("owner", "2026-08", at)
    assert.deepEqual(history.days, [day])
    assert.deepEqual(day, {
      date: "2026-08-10",
      quote: { id: quoteId ?? 0, quote: "historical text", category: "historical category", author: null, source: "historical source", sourceDetail: "historical detail" },
      tasks: [
        { id: "first", slot: 1, title: "first", completed: false, completedAt: null, sourceTodoId: null },
        { id: null, slot: 2, title: "", completed: false, completedAt: null, sourceTodoId: null },
        { id: "third", slot: 3, title: "third", completed: true, completedAt: at.toISOString(), sourceTodoId: "todo" },
      ], completedCount: 1, progress: 50,
    })
    assert.deepEqual(calls[0], { where: { userId_planDate: { userId: "owner", planDate: snapshot.planDate } }, include: { tasks: { orderBy: { slot: "asc" }, include: { sourceTodo: { select: { status: true } } } } } })
    for (const query of calls.slice(1) as { where: { userId: string } }[]) assert.equal(query.where.userId, "owner")
  })
}

test("Daily absent plan uses canonical live quote and fills exactly three empty slots", async () => {
  const quote = { id: 4, quote: "live", category: "category", author: null, source: null, sourceDetail: null, normalizedHash: "secret" }
  const service = dailyService({
    dailyPlan: { findUnique: async () => null },
    dailyQuote: { findFirst: async (query: unknown) => {
      assert.deepEqual(query, { where: { usedDate: new Date("2000-08-10T00:00:00Z"), status: true } })
      return quote
    } },
  })
  const day = await service.getDailyDay("owner", "2026-08-10")
  assert.equal(day.progress, 0)
  assert.equal(day.completedCount, 0)
  assert.deepEqual(day.tasks.map(task => task.slot), [1, 2, 3])
  assert.ok(day.tasks.every(task => task.id === null && task.completedAt === null && task.title === ""))
  assert.equal("normalizedHash" in day.quote, false)
})

test("Question list projects only allowed fields while owner detail retains reference answer", async () => {
  const secret = "ANSWER MUST NOT LEAK"
  const question = {
    id: "q", ownerId: "owner", promptMarkdown: "prompt", referenceAnswerMarkdown: secret,
    enabled: true, state: "NEW", dueAt: at, newQueueAt: null, latestRating: null,
    contentVersion: 2, scheduleVersion: 3, createdAt: at, updatedAt: at,
    futureSensitiveField: "must not leak either",
  }
  const service = loadRoute<typeof import("../lib/questions/service")>(path.join(root, "lib/questions/service.ts"), {
    "@/lib/generated/prisma/client": { Prisma: {} },
    "@/lib/db": { prisma: { question: {
      findMany: async (query: { where: unknown }) => {
        assert.deepEqual(query.where, { ownerId: "owner", AND: [{ enabled: true, referenceAnswerMarkdown: { not: null } }] })
        return [question]
      },
      count: async (query: unknown) => {
        assert.deepEqual(query, { where: { ownerId: "owner", enabled: true, referenceAnswerMarkdown: null } })
        return 9
      },
    } } },
    "@/lib/errors": errors, "./fsrs": {}, "./database": {}, "./image-references": {},
    "./validation": { QUESTION_PAGE_SIZE: 20 },
  })
  const result = await service.listQuestions("owner", { page: 1 }, at)
  const detail = service.questionView(question as never)
  const { referenceAnswerMarkdown, ...safeDetail } = detail
  assert.equal(referenceAnswerMarkdown, secret)
  assert.deepEqual(result.items, [safeDetail])
  assert.deepEqual(Object.keys(result.items[0]).sort(), ["id", "promptMarkdown", "enabled", "ready", "state", "dueAt", "newQueueAt", "latestRating", "contentVersion", "scheduleVersion", "createdAt", "updatedAt"].sort())
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(result.pendingCount, 9)
  for (const enabled of [true, false]) for (const referenceAnswerMarkdown of [null, "", secret]) {
    assert.equal(service.questionView({ ...question, enabled, referenceAnswerMarkdown } as never).ready,
      enabled && referenceAnswerMarkdown !== null)
  }
})
