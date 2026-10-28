import { expect, test, type Page, type Route } from "@playwright/test"
import { dailyDashboard, studyTransition } from "../fixtures/study-daily-state"

async function open(page: Page, mode: "Daily" | "Study") {
  await page.goto("/study-daily-state")
  await page.getByRole("button", { name: `Show ${mode}`, exact: true }).click()
}

function mutation(title: string) {
  return { ...dailyDashboard, day: { ...dailyDashboard.day, tasks: dailyDashboard.day.tasks.map((task) => task.slot === 1 ? { ...task, title } : task) } }
}

test("Daily debounce and stale save cannot overwrite a newer draft; blur flushes the queued title", async ({ page }) => {
  await page.route("**/api/questions/today", (route) => route.fulfill({ json: studyTransition }))
  const pending: Route[] = []
  await page.route("**/api/daily/tasks/1", (route) => { pending.push(route) })
  await open(page, "Daily")
  await page.clock.install({ time: new Date("2026-10-20T04:00:00Z") })
  await page.clock.pauseAt(new Date("2026-10-20T04:01:00Z"))
  const title = page.getByRole("textbox", { name: "第 1 件事", exact: true })
  await title.fill("First")
  await page.clock.runFor(499)
  expect(pending).toHaveLength(0)
  await page.clock.runFor(1)
  await expect.poll(() => pending.length).toBe(1)
  expect(pending[0].request().postDataJSON()).toEqual({ date: "2026-10-20", title: "First", sourceTodoId: null, completed: false })
  await title.fill("Latest")
  await pending[0].fulfill({ json: mutation("First server value") })
  await expect(title).toHaveValue("Latest")
  await title.blur()
  await expect.poll(() => pending.length).toBe(2)
  expect(pending[1].request().postDataJSON().title).toBe("Latest")
  await pending[1].fulfill({ json: mutation("Latest server value") })
  await expect(title).toHaveValue("Latest server value")
  await expect(page.getByRole("article", { name: "第 1 件事卡片" })).toContainText("已保存")
})

test("Daily delete shares save reconciliation but preserves optimistic deletion and errors", async ({ page }) => {
  await page.route("**/api/questions/today", (route) => route.fulfill({ json: studyTransition }))
  let deletion: Route | undefined
  await page.route("**/api/daily/tasks/1{,?*}", async (route) => {
    if (route.request().method() === "DELETE") { deletion = route; return }
    await route.fulfill({ json: mutation(route.request().postDataJSON().title) })
  })
  await open(page, "Daily")
  const title = page.getByRole("textbox", { name: "第 1 件事", exact: true })
  await page.getByRole("combobox", { name: "为第 1 件事选择 Todo" }).selectOption("todo-1")
  await expect(title).toHaveValue("Source task")
  await expect(page.getByRole("article", { name: "第 1 件事卡片" })).toContainText("已保存")
  await page.getByRole("button", { name: "清空第 1 件事" }).click()
  await expect.poll(() => Boolean(deletion)).toBe(true)
  await expect(title).toHaveValue("")
  expect(new URL(deletion!.request().url()).searchParams.get("date")).toBe("2026-10-20")
  await deletion!.fulfill({ status: 500, json: { error: "Delete fixture failure" } })
  await expect(page.getByText("Delete fixture failure")).toBeVisible()
  await expect(title).toHaveValue("")
})

test("Study direct reveal hides answer until response and stale summary cannot replace next transition", async ({ page }) => {
  let summary: Route | undefined
  let reveal: Route | undefined
  await page.route("**/api/questions/today/start", (route) => route.fulfill({ json: studyTransition }))
  await page.route("**/api/questions/today", (route) => { summary = route })
  await page.route("**/api/questions/reviews/review-1/reveal", (route) => { reveal = route })
  await page.route("**/api/questions/reviews/review-1/advance", (route) => route.fulfill({ json: { ...studyTransition, preferences: { dailyNewLimit: 23 }, question: { ...studyTransition.question, id: "q2", reviewKey: "review-2", promptMarkdown: "Question two" } } }))
  await open(page, "Study")
  await expect(page.getByText("Question one", { exact: true })).toBeVisible()
  await expect(page.getByText("Secret reference", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "揭晓并记为重来", exact: true }).click()
  await expect.poll(() => Boolean(reveal)).toBe(true)
  expect(reveal!.request().postDataJSON()).toEqual({ answerMarkdown: "", expectedContentVersion: 2, expectedScheduleVersion: 3 })
  await expect(page.getByText("Secret reference", { exact: true })).toHaveCount(0)
  await reveal!.fulfill({ json: { referenceAnswerMarkdown: "Secret reference", attempts: [], directReveal: true, rating: "AGAIN", reviewRevision: 1 } })
  await expect(page.getByText("已自动记为“重来”")).toBeVisible()
  await expect(page.getByRole("region", { name: "已揭晓的答案" })).toBeFocused()
  await expect.poll(() => Boolean(summary)).toBe(true)
  await page.getByRole("button", { name: "下一题", exact: true }).click()
  await expect(page.getByText("Question two", { exact: true })).toBeVisible()
  await summary!.fulfill({ json: { ...studyTransition, preferences: { dailyNewLimit: 99 } } })
  await expect(page.getByRole("spinbutton", { name: "每日新题上限" })).toHaveValue("23")
  await expect(page.getByText("Secret reference", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "上一条已完成" }).click()
  await expect(page.getByText("Secret reference", { exact: true })).toBeVisible()
  await expect(page.getByText("已完成 · 只读")).toBeVisible()
})

test("Study typed scoring keeps CREATE/REVISE payloads and resync behavior", async ({ page }) => {
  let starts = 0
  const ratings: unknown[] = []
  await page.route("**/api/questions/today/start", (route) => {
    starts += 1
    return route.fulfill({ json: studyTransition })
  })
  await page.route("**/api/questions/today", (route) => route.fulfill({ json: studyTransition }))
  await page.route("**/api/questions/reviews/review-1/reveal", (route) => route.fulfill({ json: { referenceAnswerMarkdown: "Typed reference", attempts: [], directReveal: false } }))
  await page.route("**/api/questions/reviews/review-1/rating", (route) => {
    ratings.push(route.request().postDataJSON())
    return route.fulfill({ json: { rating: "GOOD", reviewRevision: ratings.length } })
  })
  await page.route("**/api/questions/reviews/review-1/advance", (route) => route.fulfill({ status: 409, json: { error: "Changed", code: "RESYNC_REQUIRED" } }))
  await open(page, "Study")
  await page.getByRole("textbox", { name: "我的答案", exact: true }).fill("Typed answer")
  await page.getByRole("button", { name: "对照标准答案", exact: true }).click()
  await page.getByRole("button", { name: /^良好/ }).click()
  await expect(page.getByText("评分已保存；点击下一题前仍可改档。")).toBeVisible()
  await page.getByRole("button", { name: /^简单/ }).click()
  await expect(page.getByText("评分已更新。")).toBeVisible()
  expect(ratings).toEqual([
    { operation: "CREATE", answerMarkdown: "Typed answer", rating: "GOOD", expectedContentVersion: 2, expectedScheduleVersion: 3 },
    { operation: "REVISE", rating: "EASY", expectedReviewRevision: 1 },
  ])
  await page.getByRole("button", { name: "下一题", exact: true }).click()
  await expect(page.getByText("题目状态已变化，已重新同步今日队列。")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "我的答案", exact: true })).toHaveValue("")
  expect(starts).toBe(2)
  await expect(page.getByText("Typed reference", { exact: true })).toHaveCount(0)
})
