import { expect, test, type Page } from "@playwright/test"
import { requireDocumentTestDatabaseUrl } from "../document-test-database"

requireDocumentTestDatabaseUrl(process.env.DATABASE_URL)
const origin = "http://127.0.0.1:3255"
async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: origin }, data: { password: "Document-Test-Only-2026!" },
  })
  expect(response.status(), await response.text()).toBe(200)
}

async function integritySnapshot(page: Page) {
  const list = await page.request.get("/api/ideas")
  expect(list.status()).toBe(200)
  const ideas = await list.json()
  const posts = await page.request.get("/api/posts")
  expect(posts.status()).toBe(200)
  const todos = await page.request.get("/api/todos")
  expect(todos.status()).toBe(200)
  return { ideas, posts: await posts.json(), todos: await todos.json() }
}

test("anonymous users cannot read Idea or admin article data", async ({ page }) => {
  for (const path of ["/api/ideas", "/api/ideas/document-test-idea-0", "/api/posts/document-test-post-draft"]) {
    const response = await page.request.get(path)
    expect(response.status()).toBe(401)
    expect(response.headers()["cache-control"]).toMatch(/private.*no-store/)
    expect(await response.text()).not.toContain("首行保留")
  }
  await page.goto("/admin/ideas/document-test-idea-0")
  await expect(page).toHaveURL(/\/zh/)
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toHaveCount(0)
})

test("owner isolation and no-write reading preserve all 12 notes and existing posts", async ({ page }) => {
  await login(page)
  const foreign = await page.request.get("/api/ideas/document-test-other-idea")
  expect(foreign.status()).toBe(404)
  expect(await foreign.text()).not.toContain("other-owner-private-sentinel")
  const before = await integritySnapshot(page)
  expect(before.ideas).toHaveLength(12)
  const writes: string[] = []
  page.on("request", (request) => {
    if (/\/api\/(ideas|posts)/.test(request.url()) && !["GET", "HEAD"].includes(request.method())) writes.push(request.method())
  })
  await page.goto("/admin/ideas/document-test-idea-0")
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toBeVisible()
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  await page.getByRole("button", { name: "取消编辑" }).click()
  for (const status of ["draft", "published"]) {
    await page.goto("/admin/posts/document-test-post-" + status)
    await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
    await page.getByRole("button", { name: "编辑", exact: true }).click()
    await expect(page.locator(".ProseMirror")).toBeVisible()
    await page.getByRole("tab", { name: "预览", exact: true }).click()
    await page.getByRole("button", { name: "取消编辑" }).click()
  }
  expect(writes).toEqual([])
  expect(await integritySnapshot(page)).toEqual(before)
})

test("Idea real save survives refresh; cancel preserves content, owner, tags, projects and source", async ({ page }) => {
  await login(page)
  const url = "/api/ideas/document-test-idea-0"
  const initial = await (await page.request.get(url)).json()
  await page.goto("/admin/ideas/document-test-idea-0?edit=1")
  const text = "测试保存的正文。\n第二行保持换行。\n\n" + initial.content
  await page.getByRole("textbox", { name: "正文", exact: true }).fill(text)
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue(text)
  await page.getByRole("button", { name: "保存 Idea" }).click()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("测试保存的正文")
  await expect(page).toHaveURL(/document-test-idea-0$/)
  await page.reload()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("测试保存的正文")
  const saved = await (await page.request.get(url)).json()
  expect(saved.content).toBe(text)
  for (const key of ["id", "ownerId", "tags", "projects", "sourceInboxItem"]) expect(saved[key]).toEqual(initial[key])
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("这个内容应取消")
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "取消编辑" }).click()
  await page.reload()
  expect((await (await page.request.get(url)).json()).content).toBe(text)
  // 恢复本测试自己修改的虚构记录，其他 11 条从未写入。
  expect((await page.request.patch(url, { headers: { Origin: origin }, data: { content: initial.content } })).status()).toBe(200)
})

test("Idea list extracts clean summaries before truncating and retains Markdown details", async ({ page }, testInfo) => {
  await login(page)
  const before = await integritySnapshot(page)
  const fence = String.fromCharCode(96).repeat(3)
  // Only synthetic records in the explicitly guarded, disposable database.
  const markdown = [
    "## 二级标题", "", "首段**重点**，参考[说明](https://example.test/" + "path/".repeat(100) + ")和 `file_name`。", "",
    "### 三级标题", "", "- 列表甲", "- 列表乙", "",
    fence + "bash", "echo " + "code_".repeat(100), fence, "",
    "![图片描述](/og-default.png)", "", "末段 C#，a_b_c，2 < 3。",
  ].join("\n")
  const expected = "二级标题 首段重点，参考说明和 file_name。 三级标题 列表甲 列表乙 末段 C#，a_b_c，2 < 3。"
  const originals = before.ideas.filter((idea: { id: string }) => ["document-test-idea-0", "document-test-idea-1", "document-test-idea-2"].includes(idea.id))
  const update = async (id: string, content: string) => {
    expect((await page.request.patch("/api/ideas/" + id, { headers: { Origin: origin }, data: { content } })).status()).toBe(200)
  }
  try {
    await update("document-test-idea-0", markdown)
    await update("document-test-idea-1", fence + "python\nprint(42)\n" + fence)
    await update("document-test-idea-2", "![图片](/og-default.png)")
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/admin/ideas")
      const card = page.locator("main li").filter({ has: page.getByRole("link", { name: "长笔记演示", exact: true }) })
      await expect(card.locator("p").first()).toHaveText(expected)
      for (const title of ["短笔记演示 1", "短笔记演示 2"]) {
        await expect(page.locator("main li").filter({ has: page.getByRole("link", { name: title, exact: true }) }).locator("p").first()).toHaveText("暂无文字摘要")
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath("idea-list-" + width + ".png") })
      await page.getByRole("link", { name: "长笔记演示", exact: true }).click()
      const reader = page.getByRole("article", { name: "Idea 阅读" })
      await expect(reader.getByRole("heading", { name: "二级标题" })).toBeVisible()
      await expect(reader.getByRole("heading", { name: "三级标题" })).toBeVisible()
      await expect(reader.locator("pre")).toContainText("code_".repeat(100))
      await expect(reader.getByRole("img", { name: "图片描述" })).toBeVisible()
      expect(await reader.getByRole("link", { name: "说明" }).getAttribute("href")).toContain("path/".repeat(100))
      await page.getByRole("button", { name: "编辑", exact: true }).click()
      await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue(markdown)
      await page.getByRole("tab", { name: "预览", exact: true }).click()
      await expect(page.getByRole("article", { name: "Idea 预览" }).getByRole("heading", { name: "二级标题" })).toBeVisible()
      await page.getByRole("button", { name: "取消编辑" }).click()
      expect((await (await page.request.get("/api/ideas/document-test-idea-0")).json()).content).toBe(markdown)
    }
    // Search responses use the same card conversion as the initial server data.
    await page.goto("/admin/ideas")
    await page.getByPlaceholder("搜索标题或正文").fill("二级标题")
    await page.getByRole("button", { name: "搜索", exact: true }).click()
    await expect(page.locator("main li")).toHaveCount(1)
    await expect(page.locator("main li p").first()).toHaveText(expected)
    const after = await integritySnapshot(page)
    expect(after.ideas).toHaveLength(12)
    expect(after.posts).toEqual(before.posts)
    expect(after.todos).toEqual(before.todos)
  } finally {
    for (const idea of originals) await update(idea.id, idea.content)
  }
})

test("post saves the last input, refreshes into reading and keeps publishing explicit", async ({ page }) => {
  await login(page)
  const url = "/api/posts/document-test-post-published"
  const initial = await (await page.request.get(url)).json()
  await page.goto("/admin/posts/document-test-post-published?edit=1")
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.locator("p").first().click()
  await page.keyboard.press("Home")
  await page.keyboard.insertText("立即保存最后输入")
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await expect(page.getByRole("article", { name: "文章阅读" })).toContainText("立即保存最后输入")
  await expect(page).toHaveURL(/document-test-post-published$/)
  await page.reload()
  await expect(page.getByRole("article", { name: "文章阅读" })).toContainText("立即保存最后输入")
  const saved = await (await page.request.get(url)).json()
  expect(saved.status).toBe("PUBLISHED")
  for (const key of ["publishedAt", "seriesId", "seriesOrder", "tags", "categoryId"]) expect(saved[key]).toEqual(initial[key])
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await expect(editor).toBeVisible()
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  expect((await (await page.request.get(url)).json()).status).toBe("PUBLISHED")
  await page.getByRole("button", { name: "撤回为草稿", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("草稿")
  expect((await (await page.request.get(url)).json()).status).toBe("DRAFT")
  expect((await page.request.put(url, { headers: { Origin: origin }, data: {
    content: initial.content, status: initial.status, publishedAt: initial.publishedAt,
  } })).status()).toBe(200)
})

test("legacy article preview and metadata save never migrate its original body", async ({ page }) => {
  await login(page)
  const url = "/api/posts/document-test-post-legacy"
  const initial = await (await page.request.get(url)).json()
  await page.goto("/admin/posts/document-test-post-legacy")
  await expect(page.getByRole("article", { name: "文章阅读" })).toContainText("旧格式原文")
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await expect(page.locator(".ProseMirror")).toContainText("旧格式原文")
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("只改旧格式文章标题")
  await page.getByRole("button", { name: "存为草稿", exact: true }).click()
  const saved = await (await page.request.get(url)).json()
  expect(saved.content).toBe(initial.content)
  expect(saved.status).toBe(initial.status)
  expect((await page.request.put(url, { headers: { Origin: origin }, data: { title: initial.title } })).status()).toBe(200)
})

test("new Idea and article create only after explicit save, then read after refresh", async ({ page }) => {
  await login(page)
  await page.goto("/admin/ideas/new")
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("测试创建的 Idea")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("新建内容。\n换行保留。")
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  await page.getByRole("button", { name: "保存 Idea" }).click()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("新建内容")
  await expect(page).toHaveURL(/\/admin\/ideas\/[^/]+$/)
  await expect(page).not.toHaveURL(/\/new$/)
  const id = page.url().split("/").pop()!
  await page.reload()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("新建内容")
  expect((await page.request.delete("/api/ideas/" + id, { headers: { Origin: origin }, data: {} })).status()).toBe(200)
  await page.goto("/admin/posts/new")
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("测试创建的文章")
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.insertText("新文章正文")
  await page.getByRole("button", { name: "存为草稿", exact: true }).click()
  await expect(page.getByRole("article", { name: "文章阅读" })).toContainText("新文章正文")
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/)
  await expect(page).not.toHaveURL(/\/new$/)
  const postId = page.url().split("/").pop()!
  await page.reload()
  await expect(page.getByRole("status")).toHaveText("草稿")
  expect((await page.request.delete("/api/posts/" + postId, { headers: { Origin: origin }, data: {} })).status()).toBe(200)
})
