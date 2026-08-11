import assert from "node:assert/strict"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")
const databaseName = new URL(databaseUrl).pathname.slice(1).toLowerCase()
if (!databaseName.includes("test")) {
  throw new Error("Daily integration tests require a disposable database whose name contains 'test'")
}

async function main() {
const {
  createDailyQuote,
  deleteDailyQuote,
  deleteDailyTask,
  getDailyDashboard,
  getDailyDay,
  getDailyHistory,
  listDailyQuotes,
  saveDailyTask,
  updateDailyQuote,
} = await import("../lib/daily")
const { prisma } = await import("../lib/db")

const day = (value: string) => new Date(`${value}T04:00:00Z`)
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
let todoId: string | null = null
let userId: string | null = null

try {
  const user = await prisma.user.create({
    data: {
      username: `daily-${suffix}`,
      passwordHash: "test-only-hash",
      name: "Daily Test",
      email: `daily-${suffix}@example.test`,
    },
  })
  userId = user.id
  const todo = await prisma.todo.create({ data: { title: "从 Todo 选择的事项" } })
  todoId = todo.id

  const dashboard = await getDailyDashboard(user.id, day("2026-08-10"))
  assert.equal(dashboard.day.date, "2026-08-10")
  assert.equal(dashboard.day.tasks.length, 3)
  assert.equal(dashboard.day.progress, 0)
  assert.ok(dashboard.day.quote.quote)
  assert.ok(dashboard.todoOptions.some((item) => item.id === todo.id))

  for (const date of ["2026-08-08", "2026-08-09"]) {
    for (const slot of [1, 2, 3] as const) {
      await saveDailyTask(user.id, slot, {
        date,
        title: `${date} 事项 ${slot}`,
        completed: true,
      }, day(date))
    }
  }

  await saveDailyTask(user.id, 1, {
    date: "2026-08-10",
    title: todo.title,
    sourceTodoId: todo.id,
    completed: true,
  }, day("2026-08-10"))
  await assert.rejects(
    saveDailyTask(user.id, 2, {
      date: "2026-08-10",
      title: todo.title,
      sourceTodoId: todo.id,
      completed: false,
    }, day("2026-08-10")),
    /不能同时放入/
  )
  const detached = await saveDailyTask(user.id, 1, {
    date: "2026-08-10",
    title: "编辑后的独立事项",
    sourceTodoId: todo.id,
    completed: true,
  }, day("2026-08-10"))
  assert.equal(detached.tasks[0].sourceTodoId, null)

  const history = await getDailyHistory(user.id, "2026-08", day("2026-08-10"))
  assert.equal(history.stats.streak, 2)
  assert.equal(history.stats.recordedDays, 3)
  assert.equal(history.stats.completedDays, 2)
  assert.equal(history.stats.averageProgress, 78)
  assert.equal(history.days.length, 3)

  await assert.rejects(
    saveDailyTask(user.id, 1, {
      date: "2026-08-09",
      title: "越权修改过去",
      completed: false,
    }, day("2026-08-10")),
    /只能修改今天/
  )

  const beforeReplacement = await getDailyDay(user.id, "2026-08-11")
  await assert.rejects(
    updateDailyQuote(beforeReplacement.quote.id, { status: false }),
    /未分配.*选择|选择.*未分配/
  )
  const replacement = await createDailyQuote({
    quote: `集成测试替代提醒语 ${suffix}`,
    category: "测试",
    author: "Test",
    source: "Integration",
    status: true,
  })
  await updateDailyQuote(beforeReplacement.quote.id, {
    status: false,
    replacementQuoteId: replacement.id,
  })
  const afterReplacement = await getDailyDay(user.id, "2026-08-11")
  assert.equal(afterReplacement.quote.id, replacement.id)

  const secondReplacement = await createDailyQuote({
    quote: `集成测试第二替代提醒语 ${suffix}`,
    category: "测试",
    status: true,
  })
  await deleteDailyQuote(replacement.id, secondReplacement.id)
  assert.equal((await getDailyDay(user.id, "2026-08-11")).quote.id, secondReplacement.id)

  const quotePage = await listDailyQuotes({ page: 1, pageSize: 20, status: "active", query: suffix })
  assert.equal(quotePage.total, 1)

  await updateDailyQuote(beforeReplacement.quote.id, { status: true })
  await updateDailyQuote(secondReplacement.id, {
    status: false,
    replacementQuoteId: beforeReplacement.quote.id,
  })
  await deleteDailyQuote(secondReplacement.id)

  await deleteDailyTask(user.id, 1, "2026-08-10", day("2026-08-10"))
  const cleared = await getDailyDay(user.id, "2026-08-10")
  assert.equal(cleared.tasks.every((task) => !task.title), true)

  console.log("Daily Top 3 integration test passed")
} finally {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } })
  if (todoId) await prisma.todo.deleteMany({ where: { id: todoId } })
  await prisma.$disconnect()
}
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
