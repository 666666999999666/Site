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

test("Todo edit cancellation rehydrates persisted fields and sends no mutation", async ({ page }) => {
  const writes: unknown[] = []
  await page.route("**/api/todos/**", async (route) => {
    writes.push(route.request().postDataJSON())
    await route.fulfill({ status: 500, json: { error: "Unexpected mutation" } })
  })
  await openResource(page, "TODO")
  const row = item(page, "TODO", "Alpha")
  await row.getByRole("button", { name: "编辑：Todo Alpha", exact: true }).click()
  await row.getByRole("textbox", { name: "标题", exact: true }).fill("Unsaved title")
  await row.getByRole("textbox", { name: "描述", exact: true }).fill("Unsaved description")
  await row.getByRole("combobox", { name: "优先级", exact: true }).selectOption("2")
  await row.getByRole("button", { name: "添加子任务", exact: true }).click()
  await row.getByRole("textbox", { name: "子任务 1 标题", exact: true }).fill("Unsaved subtask")
  await row.getByRole("button", { name: "取消", exact: true }).click()
  await row.getByRole("button", { name: "编辑：Todo Alpha", exact: true }).click()
  await expect(row.getByRole("textbox", { name: "标题", exact: true })).toHaveValue("Todo Alpha")
  await expect(row.getByRole("textbox", { name: "描述", exact: true })).toHaveValue("")
  await expect(row.getByRole("combobox", { name: "优先级", exact: true })).toHaveValue("0")
  await expect(row.getByRole("textbox", { name: "子任务 1 标题", exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})

test("Todo save preserves failed input then commits normalized subtasks and searchable text", async ({ page }) => {
  const writes: Record<string, unknown>[] = []
  let fail = true
  await page.route("**/api/todos/todo-category-a", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push(body)
    await route.fulfill(fail ? { status: 500, json: { error: "Todo save rejected" } } : { json: {
      id: "todo-category-a", status: "TODO", createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z", category: null, project: null, ...body,
      subtasks: (body.subtasks as Record<string, unknown>[]).map((subtask, index) => ({ ...subtask, id: `saved-${index}` })),
    } })
  })
  await openResource(page, "TODO")
  const row = item(page, "TODO", "Alpha")
  await row.getByRole("button", { name: "编辑：Todo Alpha", exact: true }).click()
  await row.getByRole("textbox", { name: "描述", exact: true }).fill("Searchable description")
  await row.getByRole("combobox", { name: "分区", exact: true }).selectOption("")
  await row.getByRole("combobox", { name: "优先级", exact: true }).selectOption("")
  await row.getByRole("button", { name: "添加子任务", exact: true }).click()
  await row.getByRole("textbox", { name: "子任务 1 标题", exact: true }).fill("   ")
  await row.getByRole("button", { name: "添加子任务", exact: true }).click()
  await row.getByRole("textbox", { name: "子任务 2 标题", exact: true }).fill("  kept subtask  ")
  await row.getByRole("checkbox", { name: "子任务 2 完成状态", exact: true }).check()
  await row.getByRole("button", { name: "保存", exact: true }).click()
  await expect(row.getByRole("alert")).toHaveText("Todo save rejected")
  await expect(row.getByRole("textbox", { name: "描述", exact: true })).toHaveValue("Searchable description")
  await expect(row.getByRole("textbox", { name: "子任务 2 标题", exact: true })).toHaveValue("  kept subtask  ")
  const expected = {
    title: "Todo Alpha", description: "Searchable description", categoryId: null,
    projectId: null, priority: null, dueDate: null, completionCriteria: null,
    subtasks: [{ title: "  kept subtask  ", completed: true, sortOrder: 0 }],
  }
  expect(writes).toEqual([expected])
  fail = false
  await row.getByRole("button", { name: "保存", exact: true }).click()
  await expect(row.getByRole("textbox", { name: "描述", exact: true })).toHaveCount(0)
  expect(writes).toEqual([expected, expected])
  await page.getByPlaceholder("搜索标题或描述").fill(" KEPT SUBTASK ")
  await expect(row).toBeVisible()
  await expect(item(page, "TODO", "Beta")).toBeHidden()
  await row.getByRole("button", { name: "编辑：Todo Alpha", exact: true }).click()
  await expect(row.getByRole("textbox", { name: "子任务 1 标题", exact: true })).toHaveValue("  kept subtask  ")
  await expect(row.getByRole("textbox", { name: "子任务 2 标题", exact: true })).toHaveCount(0)
})

test("quick capture keeps seven raw fragments as one material with the same retry key through reload", async ({ page }) => {
  const rawInput = "todo：这仍只是素材，不是承诺\n1. 一本书\n2. 一段情绪\n3. https://example.test\n4. 也许做个工具\n5. 想聊 Agent\n6. Python 问题\n7. 随手一记  \n"
  const requests: Array<{ rawInput: string; requestKey: string; mode: string }> = []
  await page.route("**/api/inbox/items", async (route) => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) {
      await route.fulfill({ status: 503, json: { error: "暂时断线，请重试" } })
    } else {
      await route.fulfill({ status: 201, json: {
        id: "saved-material", kind: "IDEA", status: "APPLIED",
        execution: { targetHref: "/admin/ideas/saved-material" },
      } })
    }
  })
  await page.goto("/capture-browse")
  const input = page.getByRole("textbox", { name: "快速记录原文" })
  await input.fill(rawInput)
  await page.getByRole("button", { name: "保存素材", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("暂时断线，请重试")
  expect(requests).toHaveLength(1)
  expect(requests[0].rawInput).toBe(rawInput)
  expect(requests[0].mode).toBe("material")
  page.on("dialog", dialog => dialog.accept())
  await page.reload()
  await expect(page.getByRole("button", { name: "恢复草稿", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "恢复草稿", exact: true }).click()
  await expect(input).toHaveValue(rawInput)
  await page.getByRole("button", { name: "保存素材", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByRole("status")).toContainText("已保存，原文会独立保留。")
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await expect(input).toHaveValue("")
  expect(await page.evaluate(() => localStorage.getItem("qz-quick-capture:capture-fixture-owner"))).toBeNull()
})

for (const width of [390, 1440]) {
  test(`read-only question browse uses GET only at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const requests: string[] = []
    await page.route("**/api/questions/**", async (route) => {
      requests.push(route.request().method())
      await route.fulfill({ json: questionResponse("browse-fixture") })
    })
    await page.goto("/capture-browse?view=question")
    await expect(page.getByRole("heading", { name: "浏览题目" })).toBeVisible()
    await expect(page.getByText("Answer browse-fixture", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "查看答案（不评分）", exact: true }).click()
    await expect(page.getByText("Answer browse-fixture", { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`question-browse-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole("button", { name: "收起答案", exact: true }).click()
    await expect(page.getByText("Answer browse-fixture", { exact: true })).toHaveCount(0)
    await page.reload()
    await page.getByRole("button", { name: "查看答案（不评分）", exact: true }).click()
    await expect(page.getByText("Answer browse-fixture", { exact: true })).toBeVisible()
    expect(requests).toEqual(["GET", "GET"])
  })
}

test("article publication filters retain search/category context and Back/Forward state", async ({ page }) => {
  await page.goto("/admin-refactor")
  const status = page.getByRole("group", { name: "按文章发布状态筛选" })
  await status.getByRole("button", { name: "草稿", exact: true }).click()
  await expect(page).toHaveURL(/status=DRAFT/)
  await expect(page.getByRole("link", { name: "Post Alpha", exact: true }).first()).toBeVisible()
  await status.getByRole("button", { name: "已发布", exact: true }).click()
  await expect(page).toHaveURL(/status=PUBLISHED/)
  await expect(page.getByRole("link", { name: "Post Alpha", exact: true })).toHaveCount(0)
  await page.goBack()
  await expect(status.getByRole("button", { name: "草稿", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("link", { name: "Post Alpha", exact: true }).first()).toBeVisible()
  await page.goForward()
  await expect(status.getByRole("button", { name: "已发布", exact: true })).toHaveAttribute("aria-pressed", "true")
  await status.getByRole("button", { name: "全部", exact: true }).click()
  await expect(page).not.toHaveURL(/status=/)
})


test("article filters cannot race a pending search and Back restores the completed status", async ({ page }) => {
  let pending: Route | undefined
  await page.route("**/api/posts?*", route => { pending = route })
  await page.goto("/admin-refactor")
  const query = page.getByRole("textbox", { name: "搜索文章标题或内容" })
  const status = page.getByRole("group", { name: "按文章发布状态筛选" })
  await query.fill("delayed")
  await page.getByRole("button", { name: "搜索文章", exact: true }).click()
  await expect.poll(() => Boolean(pending)).toBe(true)
  await expect(query).toBeDisabled()
  await expect(status.getByRole("button", { name: "草稿", exact: true })).toBeDisabled()
  await status.getByRole("button", { name: "草稿", exact: true }).evaluate((button: HTMLButtonElement) => button.click())
  await expect(page).not.toHaveURL(/status=DRAFT/)
  await pending!.fulfill({ json: [] })
  await expect(query).toBeEnabled()
  await expect(page).toHaveURL(/q=delayed/)
  await status.getByRole("button", { name: "草稿", exact: true }).click()
  await expect(page).toHaveURL(/q=delayed&status=DRAFT/)
  await status.getByRole("button", { name: "已发布", exact: true }).click()
  await page.goBack()
  await expect(status.getByRole("button", { name: "草稿", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(query).toHaveValue("delayed")
})
