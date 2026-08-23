import { randomUUID } from "node:crypto"
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import bcrypt from "bcryptjs"
import { Client } from "pg"
import { requireQuestionTestDatabaseUrl } from "../question-test-database"

const baseUrl = "http://127.0.0.1:3250"
const originHeaders = { Origin: baseUrl }
const { url: databaseUrl, schema: testSchema } = requireQuestionTestDatabaseUrl(
  process.env.QUESTION_TEST_DATABASE_URL
)

process.env.DATABASE_URL = databaseUrl

let database: Client
let userId: string | null = null
let password = ""
let marker = ""

async function cleanupOwners(ownerIds: string[]) {
  if (ownerIds.length === 0) return
  const parameters = [ownerIds]
  await database.query("BEGIN")
  try {
    await database.query(
      `UPDATE "QuestionReviewTicket" SET "successorTicketId" = NULL WHERE "ownerId" = ANY($1::text[])`,
      parameters
    )
    for (const table of [
      "QuestionAttempt",
      "QuestionReviewLog",
      "QuestionReviewTicket",
      "QuestionScheduleResetLog",
      "QuestionImageReference",
      "QuestionImage",
      "Question",
    ]) {
      await database.query(`DELETE FROM "${table}" WHERE "ownerId" = ANY($1::text[])`, parameters)
    }
    await database.query(
      `DELETE FROM "QuestionPreference" WHERE "userId" = ANY($1::text[])`,
      parameters
    )
    await database.query(`DELETE FROM "Session" WHERE "userId" = ANY($1::text[])`, parameters)
    await database.query(`DELETE FROM "Account" WHERE "userId" = ANY($1::text[])`, parameters)
    await database.query(`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, parameters)
    await database.query("COMMIT")
  } catch (error) {
    await database.query("ROLLBACK")
    throw error
  }
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    headers: originHeaders,
    data: { password },
  })
  expect(response.status(), await response.text()).toBe(200)
}

async function createReadyQuestion(
  request: APIRequestContext,
  promptMarkdown: string,
  referenceAnswerMarkdown: string
) {
  const response = await request.post("/api/questions", {
    headers: originHeaders,
    data: { promptMarkdown, referenceAnswerMarkdown },
  })
  expect(response.status(), await response.text()).toBe(201)
  return await response.json() as { id: string; promptMarkdown: string }
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  expect(dimensions.htmlScrollWidth).toBeLessThanOrEqual(dimensions.htmlClientWidth + 1)
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1)
}

test.beforeAll(async ({}, workerInfo) => {
  database = new Client({ connectionString: databaseUrl })
  await database.connect()
  await database.query(`SET search_path TO "${testSchema}"`)

  const staleUsers = await database.query<{ id: string }>(
    `SELECT "id" FROM "User" WHERE "username" LIKE 'questions-e2e-%'`
  )
  await cleanupOwners(staleUsers.rows.map(({ id }) => id))

  const suffix = `${workerInfo.project.name.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  marker = `问题中学 E2E ${suffix}`
  password = `Question-E2E-${suffix}-Password!`
  const passwordHash = await bcrypt.hash(password, 10)
  userId = randomUUID()
  const accountId = randomUUID()
  const createdAt = new Date("1900-01-01T00:00:00.000Z")
  const updatedAt = new Date()
  await database.query(
    `INSERT INTO "User" (
      "id", "username", "passwordHash", "passwordVersion", "name", "email",
      "emailVerified", "image", "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, 1, $4, $5, TRUE, NULL, $6, $7)`,
    [
      userId,
      `questions-e2e-${suffix}`,
      passwordHash,
      "Questions E2E",
      `questions-e2e-${suffix}@example.test`,
      createdAt,
      updatedAt,
    ]
  )
  await database.query(
    `INSERT INTO "Account" (
      "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
    ) VALUES ($1, $2, 'credential', $3, $4, $5, $5)`,
    [accountId, userId, userId, passwordHash, updatedAt]
  )
})

test.afterAll(async () => {
  try {
    if (userId) await cleanupOwners([userId])
  } finally {
    await database?.end()
  }
})

test("question APIs stay private and the complete review workflow is auditable", async ({ page, playwright }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-light", "Run the stateful workflow once; visual coverage runs in every project")
  test.setTimeout(360_000)

  const anonymous = await playwright.request.newContext({ baseURL: baseUrl })
  try {
    expect((await anonymous.get("/api/questions")).status()).toBe(401)
    expect((await anonymous.get("/api/questions/today")).status()).toBe(401)
    expect((await anonymous.post("/api/questions/today/start", {
      headers: originHeaders,
      data: {},
    })).status()).toBe(401)
  } finally {
    await anonymous.dispose()
  }

  await login(page)

  expect((await page.request.post("/api/questions", {
    headers: { Origin: "https://evil.example" },
    data: { promptMarkdown: "跨域题目", referenceAnswerMarkdown: null },
  })).status()).toBe(403)
  expect((await page.request.post("/api/questions", {
    data: { promptMarkdown: "缺失 Origin 的题目", referenceAnswerMarkdown: null },
  })).status()).toBe(403)

  const typedPrompt = `${marker} · typed：解释事件循环`
  const typedAnswer = `${marker} · typed 标准答案（揭晓前不可见）`
  const myAnswer = `${marker} · 我的闭卷答案`
  const directPrompt = `${marker} · direct：解释闭包`
  const directAnswer = `${marker} · direct 标准答案（揭晓前不可见）`

  await page.goto("/admin/questions/new")
  await expect(page.getByRole("heading", { name: "新建题目" })).toBeVisible()
  await page.locator("#question-prompt").fill(typedPrompt)
  await page.getByRole("button", { name: "保存题目" }).click()
  await expect(page).toHaveURL(/\/admin\/questions\/[^/]+$/)
  await expect(page.getByRole("heading", { name: "编辑题目" })).toBeVisible()
  await expect(page.getByText("待补答案", { exact: true })).toBeVisible()

  const typedQuestionId = new URL(page.url()).pathname.split("/").at(-1)
  expect(typedQuestionId).toBeTruthy()
  await page.locator("#question-reference-answer").fill(typedAnswer)
  await page.getByRole("button", { name: "保存修改" }).click()
  await expect(page.getByRole("status").filter({ hasText: "题目已保存" })).toBeVisible()

  // The queue is FIFO for new questions. Keep their enqueue timestamps
  // observably distinct so this browser test cannot depend on cuid ordering.
  await page.waitForTimeout(25)
  const directQuestion = await createReadyQuestion(page.request, directPrompt, directAnswer)

  const listResponse = await page.request.get("/api/questions?status=READY&page=1")
  expect(listResponse.status()).toBe(200)
  const listPayload = await listResponse.json() as {
    items: Array<Record<string, unknown> & { id: string }>
  }
  const listedTyped = listPayload.items.find((item) => item.id === typedQuestionId)
  const listedDirect = listPayload.items.find((item) => item.id === directQuestion.id)
  expect(listedTyped).toBeTruthy()
  expect(listedDirect).toBeTruthy()
  expect(listedTyped).not.toHaveProperty("referenceAnswerMarkdown")
  expect(listedDirect).not.toHaveProperty("referenceAnswerMarkdown")
  expect(JSON.stringify(listPayload)).not.toContain(typedAnswer)
  expect(JSON.stringify(listPayload)).not.toContain(directAnswer)

  const todayResponse = await page.request.get("/api/questions/today")
  expect(todayResponse.status()).toBe(200)
  expect(JSON.stringify(await todayResponse.json())).not.toContain(typedAnswer)

  const startResponse = await page.request.post("/api/questions/today/start", {
    headers: originHeaders,
    data: {},
  })
  expect(startResponse.status()).toBe(200)
  const started = await startResponse.json() as {
    question?: { id: string; promptMarkdown: string; referenceAnswerMarkdown?: string }
  }
  expect(started.question?.id).toBe(typedQuestionId)
  expect(started.question).not.toHaveProperty("referenceAnswerMarkdown")
  expect(JSON.stringify(started)).not.toContain(typedAnswer)

  const hydrationErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) hydrationErrors.push(message.text())
  })

  await page.goto("/admin/questions")
  await expect(page.getByRole("heading", { name: "问题中学" })).toBeVisible()
  await expect(page.getByText(typedPrompt, { exact: true })).toBeVisible()
  expect(await page.locator("body").textContent()).not.toContain(typedAnswer)

  await page.locator("#my-answer").fill(myAnswer)
  await page.getByRole("button", { name: "对照标准答案" }).click()
  await expect(page.getByText(typedAnswer, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /^良好/ }).click()
  await expect(page.getByText("评分已保存；点击下一题前仍可改档。", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /^简单/ }).click()
  await expect(page.getByText("评分已更新。", { exact: true })).toBeVisible()
  await expect(page.getByText(/当前评分：简单/)).toBeVisible()
  await page.getByRole("button", { name: "下一题" }).click()

  await expect(page.getByText(directPrompt, { exact: true })).toBeVisible()
  expect(await page.locator("body").textContent()).not.toContain(directAnswer)
  await page.getByRole("button", { name: "直接揭晓" }).click()
  await expect(page.getByText(directAnswer, { exact: true })).toBeVisible()
  await expect(page.getByText("已自动记为“重来”", { exact: true })).toBeVisible()
  await expect(page.getByText("直接揭晓不保存答案正文，也不能改档。", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "下一题" }).click()

  await page.getByRole("tab", { name: "题库管理" }).click()
  await expect(page.getByLabel("题库管理").getByText("题库管理", { exact: true })).toBeVisible()
  await page.getByRole("textbox", { name: "搜索题库" }).fill(marker)
  await page.getByRole("button", { name: "搜索", exact: true }).click()
  const questionList = page.getByLabel("题目列表")
  await expect(questionList).toContainText(typedPrompt)
  await expect(questionList).toContainText(directPrompt)
  await expect(questionList).not.toContainText(typedAnswer)
  await expect(questionList).not.toContainText(directAnswer)
  await page.screenshot({
    path: "test-results/questions-library-desktop-light.png",
    fullPage: true,
    caret: "initial",
  })

  await questionList.getByRole("article").filter({ hasText: typedPrompt })
    .getByRole("link", { name: "编辑" }).click()
  await expect(page.getByRole("heading", { name: "编辑题目" })).toBeVisible()
  await expect(page.locator("#question-reference-answer")).toHaveValue(typedAnswer)
  const revisedPrompt = `${typedPrompt}（已编辑）`
  await page.locator("#question-prompt").fill(revisedPrompt)
  await page.getByText("保留当前排程", { exact: true }).click()
  await page.getByRole("button", { name: "保存修改" }).click()
  await expect(page.getByRole("status").filter({ hasText: "题目已保存" })).toBeVisible()

  expect(hydrationErrors).toEqual([])
})

test("question school is readable without horizontal overflow in every viewport and theme", async ({ page }, testInfo) => {
  await login(page)
  const visualPrompt = `${marker} · ${testInfo.project.name} 可视化题目`
  const visualAnswer = `${marker} · ${testInfo.project.name} 仅揭晓后显示的答案`
  await createReadyQuestion(
    page.request,
    visualPrompt,
    visualAnswer
  )

  await page.goto("/admin/questions")
  await expect(page.getByRole("heading", { name: "问题中学" })).toBeVisible()
  await expect(page.getByText(visualPrompt, { exact: true })).toBeVisible()

  const expectsDark = testInfo.project.name.endsWith("dark")
  if (expectsDark) await expect(page.locator("html")).toHaveClass(/dark/)
  else await expect(page.locator("html")).not.toHaveClass(/dark/)

  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: `test-results/questions-${testInfo.project.name}.png`,
    fullPage: true,
    caret: "initial",
  })

  await page.getByRole("button", { name: "直接揭晓" }).click()
  await expect(page.getByText(visualAnswer, { exact: true })).toBeVisible()
  await expect(page.getByText("已自动记为“重来”", { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: `test-results/questions-revealed-${testInfo.project.name}.png`,
    fullPage: true,
    caret: "initial",
  })
})
