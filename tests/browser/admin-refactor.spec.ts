import { expect, test, type Page, type Route } from "@playwright/test"

async function openResource(page: Page, kind: "BLOG" | "TODO") {
  await page.addInitScript(() => localStorage.setItem("qz-todo-category", "category-b"))
  await page.goto("/admin-refactor")
  await page.getByRole("button", { name: `Show ${kind}`, exact: true }).click()
}

function item(page: Page, kind: "BLOG" | "TODO", name: string) {
  return kind === "BLOG"
    ? page.locator("tbody tr").filter({ has: page.getByRole("link", { name: `Post ${name}`, exact: true }) })
    : page.locator("li").filter({ has: page.getByText(`Todo ${name}`, { exact: true }) })
}

async function rememberedCategory(page: Page) {
  return page.evaluate(() => localStorage.getItem("qz-todo-category"))
}

for (const kind of ["BLOG", "TODO"] as const) {
  test(`${kind} categories preserve CRUD, relations, sorting and resource-specific selections`, async ({ page }) => {
    const requests: { method: string; body: unknown }[] = []
    await page.route("**/api/categories{,/**}", async (route) => {
      const request = route.request()
      const body = request.postData() ? request.postDataJSON() : null
      requests.push({ method: request.method(), body })
      const id = request.method() === "POST" ? "category-c" : new URL(request.url()).pathname.split("/").at(-1)
      await route.fulfill({ json: request.method() === "DELETE" ? {} : { id, type: kind, color: null, ...body } })
    })
    await openResource(page, kind)
    const sidebar = page.locator("aside").first()
    await sidebar.getByRole("button", { name: "Alpha", exact: true }).click()
    await expect(item(page, kind, "Beta")).toBeHidden()

    await page.getByPlaceholder("新分区", { exact: true }).fill("  Gamma  ")
    await page.getByRole("button", { name: "创建分区", exact: true }).click()
    await expect(sidebar.getByRole("button", { name: "Gamma", exact: true })).toBeVisible()
    expect(requests[0]).toEqual({ method: "POST", body: { name: "Gamma", type: kind, sortOrder: 20 } })
    await expect(item(page, kind, "Alpha")).toBeVisible()
    await expect(item(page, kind, "Beta")).toBeHidden()
    expect(await rememberedCategory(page)).toBe(kind === "TODO" ? "category-c" : "category-b")
    if (kind === "TODO") {
      // The existing selector validates against initialCategories, even after create.
      await expect(page.getByRole("combobox", { name: "新 Todo 分区" })).toHaveValue("category-a")
      await page.getByRole("combobox", { name: "新 Todo 分区" }).selectOption("category-b")
    }

    await page.getByRole("button", { name: "编辑分区 Alpha", exact: true }).click()
    await page.getByRole("textbox", { name: "分区名称", exact: true }).fill("Renamed")
    await page.getByRole("spinbutton", { name: "排序值", exact: true }).fill("30")
    await page.getByRole("button", { name: "保存分区", exact: true }).click()
    await expect(sidebar.getByRole("button", { name: "Renamed", exact: true })).toBeVisible()
    await expect(item(page, kind, "Alpha")).toContainText("Renamed")
    await expect(item(page, kind, "Beta")).toBeHidden()
    expect(requests[1]).toEqual({ method: "PATCH", body: { name: "Renamed", sortOrder: 30 } })
    const categoryNames = await sidebar.locator("button.text-left").allTextContents()
    expect(categoryNames).toEqual(["Beta", "Gamma", "Renamed"])

    page.on("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "删除分区 Renamed", exact: true }).click()
    await expect(sidebar.getByRole("button", { name: "Renamed", exact: true })).toHaveCount(0)
    await expect(item(page, kind, "Beta")).toBeVisible()
    await expect(item(page, kind, "Alpha")).not.toContainText("Renamed")
    await expect(sidebar.getByRole("button", { name: "全部", exact: true })).toHaveClass(/font-medium/)
    expect(await rememberedCategory(page)).toBe("category-b")
    expect(requests[2]).toEqual({ method: "DELETE", body: null })

    await page.getByRole("button", { name: "删除分区 Beta", exact: true }).click()
    await expect(sidebar.getByRole("button", { name: "Beta", exact: true })).toHaveCount(0)
    await expect(item(page, kind, "Beta")).toBeVisible()
    expect(await rememberedCategory(page)).toBe(kind === "TODO" ? null : "category-b")
  })

  test(`${kind} category failures preserve list, related items, active selection and remembered category`, async ({ page }) => {
    const methods: string[] = []
    await page.route("**/api/categories{,/**}", async (route) => {
      methods.push(route.request().method())
      await route.fulfill({ status: 500, json: { error: "Category rejected" } })
    })
    await openResource(page, kind)
    const sidebar = page.locator("aside").first()
    await sidebar.getByRole("button", { name: "Alpha", exact: true }).click()
    if (kind === "TODO") await page.getByRole("combobox", { name: "新 Todo 分区" }).selectOption("category-a")
    await page.getByPlaceholder("新分区", { exact: true }).fill("Gamma")
    await page.getByRole("button", { name: "创建分区", exact: true }).click()
    await expect(sidebar.getByRole("alert")).toHaveText("Category rejected")
    await expect(page.getByPlaceholder("新分区", { exact: true })).toHaveValue("Gamma")
    await expect(sidebar.getByRole("button", { name: "Gamma", exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "编辑分区 Alpha", exact: true }).click()
    await page.getByRole("textbox", { name: "分区名称", exact: true }).fill("Rename rejected")
    await page.getByRole("button", { name: "保存分区", exact: true }).click()
    await expect.poll(() => methods.length).toBe(2)
    await expect(sidebar.getByRole("alert")).toHaveText("Category rejected")
    await expect(page.getByRole("textbox", { name: "分区名称", exact: true })).toHaveValue("Rename rejected")
    await expect(item(page, kind, "Alpha")).toContainText("Alpha")
    await expect(item(page, kind, "Alpha")).not.toContainText("Rename rejected")
    await page.getByRole("button", { name: "取消编辑分区", exact: true }).click()

    page.on("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "删除分区 Alpha", exact: true }).click()
    await expect.poll(() => methods.length).toBe(3)
    await expect(sidebar.getByRole("alert")).toHaveText("Category rejected")
    await expect(sidebar.getByRole("button", { name: "Alpha", exact: true })).toHaveClass(/font-medium/)
    await expect(item(page, kind, "Alpha")).toBeVisible()
    await expect(item(page, kind, "Beta")).toBeHidden()
    expect(await rememberedCategory(page)).toBe(kind === "TODO" ? "category-a" : "category-b")
    expect(methods).toEqual(["POST", "PATCH", "DELETE"])
  })
}

function questionResponse(id: string, revision = 1, enabled = true, answer: string | null = `Answer ${id}`) {
  return {
    question: {
      id, promptMarkdown: `Prompt ${id} v${revision}`, referenceAnswerMarkdown: answer,
      contentVersion: revision, scheduleVersion: revision + 10, createdAt: "2026-10-20T00:00:00Z",
      enabled, ready: answer !== null, state: "NEW", dueAt: null, newQueueAt: null,
      latestRating: "GOOD", updatedAt: "2026-10-20T00:00:00Z",
    },
    attempts: [{ id: `attempt-${revision}`, answerMarkdown: `Attempt v${revision}`, rating: "GOOD", mode: "TYPED", createdAt: "2026-10-20T00:00:00Z" }],
    timeline: { items: [{ id: `event-${revision}`, type: `Event v${revision}` }], total: revision, page: 1, pageSize: 20 },
  }
}

for (const lateResult of ["success", "failure"] as const) {
  test(`cancelled question initialization ignores late ${lateResult} after a record switch`, async ({ page }) => {
    const delayed: Route[] = []
    await page.route("**/api/questions/question-a", (route) => { delayed.push(route) })
    await page.route("**/api/questions/question-b", (route) => route.fulfill({ json: questionResponse("question-b", 2, true, null) }))
    await page.goto("/admin-refactor")
    await page.getByRole("button", { name: "Show questions", exact: true }).click()
    await expect.poll(() => delayed.length).toBeGreaterThan(0)
    await page.getByRole("button", { name: "Switch question", exact: true }).click()
    await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-b v2")
    for (const route of delayed) {
      const response = page.waitForResponse((response) => response.url().endsWith("/api/questions/question-a"))
      await route.fulfill(lateResult === "success"
        ? { json: questionResponse("question-a") }
        : { status: 500, json: { error: "Stale load failure" } })
      await (await response).finished()
    }
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-b v2")
    await expect(page.getByRole("textbox", { name: "标准答案（可选）", exact: true })).toHaveValue("")
    await expect(page.getByText("Attempt v2", { exact: true })).toBeVisible()
    await expect(page.getByText("Event v2", { exact: true })).toBeVisible()
    await expect(page.getByText("Stale load failure", { exact: true })).toHaveCount(0)
  })
}

test("a cancelled question response cannot finish the next record's pending load", async ({ page }) => {
  const delayed: Record<string, Route[]> = { "question-a": [], "question-b": [] }
  await page.route("**/api/questions/question-*", (route) => {
    delayed[new URL(route.request().url()).pathname.split("/").at(-1)!].push(route)
  })
  await page.goto("/admin-refactor")
  await page.getByRole("button", { name: "Show questions", exact: true }).click()
  await expect.poll(() => delayed["question-a"].length).toBeGreaterThan(0)
  await page.getByRole("button", { name: "Switch question", exact: true }).click()
  await expect.poll(() => delayed["question-b"].length).toBeGreaterThan(0)
  for (const route of delayed["question-a"]) {
    const response = page.waitForResponse((response) => response.url().endsWith("/api/questions/question-a"))
    await route.fulfill({ json: questionResponse("question-a") })
    await (await response).finished()
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByRole("status")).toContainText("正在加载题目")
  await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveCount(0)
  for (const route of delayed["question-b"]) await route.fulfill({ json: questionResponse("question-b") })
  await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-b v1")
})

test("question edit and enabled reloads apply all response fields and reset schedule choice", async ({ page }) => {
  let revision = 1
  let enabled = true
  const mutations: unknown[] = []
  await page.route("**/api/questions/question-a", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON()
      mutations.push(body)
      revision += 1
      if (body.operation === "SET_ENABLED") enabled = body.enabled
      await route.fulfill({ json: {} })
    } else {
      await route.fulfill({ json: questionResponse("question-a", revision, enabled, enabled ? `Answer v${revision}` : null) })
    }
  })
  await page.goto("/admin-refactor")
  await page.getByRole("button", { name: "Show questions", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-a v1")
  await page.getByRole("textbox", { name: "题目", exact: true }).fill("Edited prompt")
  await page.getByRole("radio", { name: /保留当前排程/ }).check()
  await page.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(page.getByText("题目已保存", { exact: true })).toBeVisible()
  expect(mutations[0]).toEqual({ operation: "EDIT_CONTENT", promptMarkdown: "Edited prompt", referenceAnswerMarkdown: "Answer v1", schedulePolicy: "KEEP", expectedContentVersion: 1, expectedScheduleVersion: 11 })
  await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-a v2")
  await expect(page.getByRole("textbox", { name: "标准答案（可选）", exact: true })).toHaveValue("Answer v2")
  await expect(page.getByText("Attempt v2", { exact: true })).toBeVisible()
  await expect(page.getByText("Event v2", { exact: true })).toBeVisible()
  // The policy controls are hidden while clean. Editing only the prompt reveals
  // them without resetting policy itself, so this verifies response hydration did.
  await page.getByRole("textbox", { name: "题目", exact: true }).fill("Second unsaved edit")
  await expect(page.getByRole("radio", { name: /保留当前排程/ })).not.toBeChecked()
  await expect(page.getByRole("radio", { name: /重置为新题/ })).not.toBeChecked()
  await page.getByRole("button", { name: "停用题目", exact: true }).click()
  await expect(page.getByRole("button", { name: "启用题目", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "标准答案（可选）", exact: true })).toHaveValue("")
  await expect(page.getByRole("textbox", { name: "题目", exact: true })).toHaveValue("Prompt question-a v3")
  await expect(page.getByText("Attempt v3", { exact: true })).toBeVisible()
  await expect(page.getByText("Event v3", { exact: true })).toBeVisible()
  expect(mutations[1]).toEqual({ operation: "SET_ENABLED", enabled: false })
})

test("series create and update retain slug differences, failed drafts and successful reset", async ({ page }) => {
  let fail = true
  const mutations: { method: string; body: Record<string, unknown> }[] = []
  await page.route("**/api/series{,/**}", async (route) => {
    const body = route.request().postDataJSON()
    mutations.push({ method: route.request().method(), body })
    await route.fulfill(fail ? { status: 500, json: { error: "Series rejected" } } : { json: { id: "series-a", slug: "generated-slug", ...body } })
  })
  await page.goto("/admin-refactor")
  const seriesRegion = page.getByRole("region", { name: "系列", exact: true })
  await page.getByRole("textbox", { name: "新系列标题", exact: true }).fill("  Series  ")
  await page.getByRole("textbox", { name: "新系列简介", exact: true }).fill("  Description  ")
  await page.getByRole("button", { name: "创建系列", exact: true }).click()
  await expect(seriesRegion.getByRole("alert")).toHaveText("Series rejected")
  await expect(page.getByRole("textbox", { name: "新系列标题", exact: true })).toHaveValue("  Series  ")
  expect(mutations[0]).toEqual({ method: "POST", body: { title: "Series", description: "Description", coverImage: null, sortOrder: 0 } })
  fail = false
  await page.getByRole("button", { name: "创建系列", exact: true }).click()
  await expect(page.getByRole("button", { name: "编辑系列 Series", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "新系列标题", exact: true })).toHaveValue("")
  await expect(page.getByRole("textbox", { name: "新系列简介", exact: true })).toHaveValue("")
  await page.getByRole("button", { name: "编辑系列 Series", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "系列 slug", exact: true })).toHaveValue("generated-slug")
  await page.getByRole("textbox", { name: "系列 slug", exact: true }).fill(" ")
  await page.getByRole("button", { name: "保存系列", exact: true }).click()
  await expect(seriesRegion.getByRole("alert")).toHaveText("系列标题、slug 和简介均为必填项")
  expect(mutations).toHaveLength(2)
  fail = true
  await page.getByRole("textbox", { name: "系列 slug", exact: true }).fill("  edited-slug  ")
  await page.getByRole("button", { name: "保存系列", exact: true }).click()
  await expect(seriesRegion.getByRole("alert")).toHaveText("Series rejected")
  await expect(page.getByRole("textbox", { name: "系列 slug", exact: true })).toHaveValue("  edited-slug  ")
  expect(mutations[2]).toEqual({ method: "PATCH", body: { title: "Series", slug: "edited-slug", description: "Description", coverImage: null, sortOrder: 0 } })
  fail = false
  await page.getByRole("button", { name: "保存系列", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "系列 slug", exact: true })).toHaveCount(0)
  await expect(page.getByText("0 · /edited-slug", { exact: true })).toBeVisible()
})
