import { expect, test } from "@playwright/test"

const password = process.env.PLAYWRIGHT_DAILY_PASSWORD
if (!password) throw new Error("PLAYWRIGHT_DAILY_PASSWORD is required")

test("Daily Top 3 supports the complete admin workflow and responsive layouts", async ({ page, playwright }) => {
  test.setTimeout(360_000)
  const baseUrl = "http://127.0.0.1:3230"
  const originHeaders = { Origin: baseUrl }
  const marker = `浏览器测试 ${Date.now()}`
  const hydrationErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("hydrated")) {
      hydrationErrors.push(message.text())
    }
  })

  const anonymous = await playwright.request.newContext({ baseURL: baseUrl })
  try {
    expect((await anonymous.get("/api/daily")).status()).toBe(401)
    expect((await anonymous.get("/api/daily/history")).status()).toBe(401)
    expect((await anonymous.post("/api/daily/quotes", {
      headers: originHeaders,
      data: { quote: "匿名请求", category: "测试" },
    })).status()).toBe(401)
  } finally {
    await anonymous.dispose()
  }

  const loginResponse = await page.request.post("/api/auth/login", {
    headers: originHeaders,
    data: { password },
  })
  expect(loginResponse.ok()).toBeTruthy()

  const todoResponse = await page.request.post("/api/todos", {
    headers: originHeaders,
    data: { title: `${marker} Todo` },
  })
  expect(todoResponse.ok()).toBeTruthy()
  const todo = await todoResponse.json() as { id: string }
  const initialDayResponse = await page.request.get("/api/daily")
  const initialDay = await initialDayResponse.json() as { date: string }

  const validTask = {
    date: initialDay.date,
    title: `${marker} 安全测试`,
    completed: false,
  }
  expect((await page.request.put("/api/daily/tasks/1", {
    headers: { Origin: "https://evil.example" },
    data: validTask,
  })).status()).toBe(403)
  expect((await page.request.put("/api/daily/tasks/1", { data: validTask })).status()).toBe(403)
  expect((await page.request.put("/api/daily/tasks/1", {
    headers: { ...originHeaders, "Content-Type": "text/plain" },
    data: JSON.stringify(validTask),
  })).status()).toBe(400)
  expect((await page.request.put("/api/daily/tasks/1", {
    headers: originHeaders,
    data: { ...validTask, unexpected: true },
  })).status()).toBe(400)

  let quoteId: number | null = null
  try {
    await page.goto("/admin")
    await expect(page.getByRole("heading", { name: "今日三件事" })).toBeVisible()
    const sidebar = page.locator("aside nav")
    await expect(sidebar.getByRole("link", { name: "历史记录" })).toBeHidden()
    await sidebar.getByRole("button", { name: "展开每日三件事菜单" }).click()
    await expect(sidebar.getByRole("link", { name: "历史记录" })).toBeVisible()
    await expect(sidebar.getByRole("link", { name: "每日提醒语" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "第 1 件事", exact: true })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "第 2 件事", exact: true })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "第 3 件事", exact: true })).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: "test-results/daily-light-desktop.png", fullPage: true, caret: "initial" })

    const firstTask = page.getByRole("textbox", { name: "第 1 件事", exact: true })
    await firstTask.fill(`${marker} 手动事项`)
    await firstTask.blur()
    await expect(page.getByText("已保存").first()).toBeVisible()

    await page.getByLabel("为第 2 件事选择 Todo").selectOption(todo.id)
    await expect(page.getByRole("textbox", { name: "第 2 件事", exact: true })).toHaveValue(`${marker} Todo`)
    await expect(page.getByText("已保存").nth(1)).toBeVisible()

    await page.getByRole("button", { name: "完成第 1 件事" }).click()
    await page.getByRole("button", { name: "完成第 2 件事" }).click()
    await expect(page.getByRole("progressbar", { name: "今日完成度" })).toHaveAttribute("aria-valuenow", "67")
    await expect(page.getByText("已经完成大半，继续保持当前节奏。")).toBeVisible()
    await expect(page.getByRole("article", { name: "第 1 件事卡片" }).getByText("已保存")).toBeVisible()
    await expect(page.getByRole("article", { name: "第 2 件事卡片" }).getByText("已保存")).toBeVisible()
    await page.screenshot({ path: "test-results/daily-progress-desktop.png", fullPage: true, caret: "initial" })

    await page.reload()
    await expect(page.getByRole("textbox", { name: "第 1 件事", exact: true })).toHaveValue(`${marker} 手动事项`)
    await expect(page.getByRole("textbox", { name: "第 2 件事", exact: true })).toHaveValue(`${marker} Todo`)
    await expect(page.getByRole("progressbar", { name: "今日完成度" })).toHaveAttribute("aria-valuenow", "67")

    await page.goto("/admin/daily/history")
    await expect(page.getByRole("heading", { name: "历史记录" })).toBeVisible()
    await expect(page.locator("aside nav").getByRole("link", { name: "每日提醒语" })).toBeVisible()
    await expect(page.getByText(`${marker} 手动事项`)).toBeVisible()
    await expect(page.getByText(`${marker} Todo`)).toBeVisible()

    await page.goto("/admin/daily/quotes")
    await expect(page.getByRole("heading", { name: "每日提醒语" })).toBeVisible()
    await expect(page.getByText("366 条提醒语")).toBeVisible()
    await page.getByRole("button", { name: "新增提醒语" }).click()
    await page.getByRole("textbox", { name: "提醒语", exact: true }).fill(`${marker} 提醒语`)
    const categoryInput = page.locator("#daily-quote-category")
    await expect(categoryInput).toBeEditable()
    await categoryInput.fill("测试", { force: true })
    const saveQuote = page.getByRole("button", { name: "保存", exact: true })
    await expect(saveQuote).toBeEnabled()
    await saveQuote.click()
    await page.getByPlaceholder("搜索内容、分类、作者或来源").fill(marker)
    await page.getByRole("button", { name: "搜索", exact: true }).click()
    await expect(page.getByText(`${marker} 提醒语`)).toBeVisible()

    const quoteSearch = await page.request.get(`/api/daily/quotes?query=${encodeURIComponent(marker)}&page=1&pageSize=20&status=all`)
    const quotePayload = await quoteSearch.json() as { items: Array<{ id: number }> }
    quoteId = quotePayload.items[0]?.id ?? null

    await page.goto("/admin")
    await page.getByRole("button", { name: "切换深色模式" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.screenshot({ path: "test-results/daily-dark-desktop.png", fullPage: true, caret: "initial" })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.getByRole("heading", { name: "今日三件事" })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
    await page.screenshot({ path: "test-results/daily-dark-mobile.png", fullPage: true, caret: "initial" })
    expect(hydrationErrors).toEqual([])
  } finally {
    if (quoteId) {
      await page.request.delete(`/api/daily/quotes/${quoteId}`, { headers: originHeaders })
    }
    for (const slot of [1, 2, 3]) {
      await page.request.delete(
        `/api/daily/tasks/${slot}?date=${encodeURIComponent(initialDay.date)}`,
        { headers: originHeaders }
      )
    }
    await page.request.delete(`/api/todos/${todo.id}`, { headers: originHeaders })
  }
})
