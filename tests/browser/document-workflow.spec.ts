import { expect, test, type Page } from "@playwright/test"
import { ideaTestContent, postTestContent } from "../fixtures/document-content"
import path from "node:path"

const owner = "document-test-owner"
const ideaKey = "qz-idea-draft:" + owner + ":document-test-idea"
const postKey = "qz-post-draft:" + owner + ":document-test-post"

function acceptDiscard(page: Page) {
  page.once("dialog", (dialog) => dialog.accept())
}

async function mockSave(page: Page, kind: "idea" | "post", fail = false) {
  const writes: Record<string, unknown>[] = []
  const original = kind === "idea"
    ? { id: "document-test-idea", title: "Idea 阅读与编辑演示", content: ideaTestContent, tags: ["演示", "Markdown"],
        projects: [{ id: "document-test-project", title: "演示项目" }],
        sourceInboxItem: { id: "document-test-source", rawInput: "idea：合成的来源原文\n第二行" } }
    : { id: "document-test-post", title: "长文阅读与编辑演示", content: postTestContent, tags: ["演示"], status: "PUBLISHED",
        excerpt: "", categoryId: "document-test-category", seriesId: null, seriesOrder: null,
        publishedAt: "2026-10-04T00:00:00Z" }
  await page.route("**/api/" + (kind === "idea" ? "ideas" : "posts") + "/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push(body)
    await route.fulfill({ status: fail ? 500 : 200, contentType: "application/json",
      body: JSON.stringify(fail ? { error: "演示保存失败" } : { ...original, ...body }) })
  })
  return writes
}

test("Idea defaults to safe reading, keeps plain line breaks and never guesses headings", async ({ page }) => {
  await page.goto("/document-workflow")
  const reader = page.getByRole("article", { name: "Idea 阅读" })
  await expect(reader).toBeVisible()
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toBeHidden()
  await expect(reader.getByRole("heading", { name: "标准标题", exact: true })).toBeVisible()
  await expect(reader.getByRole("heading", { name: "一、普通文字标签" })).toHaveCount(0)
  await expect(reader.locator("br")).toHaveCount(1)
  await expect(reader.locator("pre").nth(1)).toContainText("    return 42")
  await expect(reader).toContainText("<script>window.__documentXss = true</script>")
  expect(await page.evaluate(() => Reflect.get(window, "__documentXss"))).toBeUndefined()
  expect(await reader.getByRole("link", { name: "危险链接" }).getAttribute("href")).toBe("")
})

test("Idea preview retains original text and selection; cancel never writes", async ({ page }) => {
  const writes = await mockSave(page, "idea")
  await page.goto("/document-workflow")
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  const editor = page.getByRole("textbox", { name: "正文", exact: true })
  await expect(editor).toHaveValue(ideaTestContent)
  await editor.fill(ideaTestContent + "\n最后一行")
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(8, 12))
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  await expect(page.getByRole("article", { name: "Idea 预览" })).toContainText("最后一行")
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  expect(await editor.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([8, 12])
  acceptDiscard(page)
  await page.getByRole("button", { name: "取消编辑" }).click()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).not.toContainText("最后一行")
  expect(writes).toHaveLength(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), ideaKey)).toBeNull()
})

test("Idea saves immediately into reading and keeps unaffected fields out of PATCH", async ({ page }) => {
  const writes = await mockSave(page, "idea")
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("已保存正文\n    原始缩进")
  await page.getByRole("button", { name: "保存 Idea" }).click()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("已保存正文")
  expect(writes).toEqual([{ content: "已保存正文\n    原始缩进" }])
  await expect(page.getByRole("status")).not.toContainText("未保存")
  expect(await page.evaluate((key) => localStorage.getItem(key), ideaKey)).toBeNull()
})

test("failed save keeps draft and browser storage errors are visible", async ({ page }) => {
  await mockSave(page, "idea", true)
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("失败后保留")
  await page.getByRole("button", { name: "保存 Idea" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "演示保存失败" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue("失败后保留")
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data.content, ideaKey)).toBe("失败后保留")
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("test storage failure") } })
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("存储失败仍在页面")
  await expect(page.getByRole("alert").filter({ hasText: "浏览器无法保存" })).toBeVisible()
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("丢失当前输入")
    await dialog.dismiss()
  })
  await page.getByRole("button", { name: "返回列表" }).click()
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue("存储失败仍在页面")
})

test("refresh and browser back preserve drafts; recovery never automatically applies", async ({ page }) => {
  await page.goto("/article-preview")
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("后退后可以恢复")
  await page.goBack()
  await page.goForward()
  await expect(page.getByRole("button", { name: "恢复草稿" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue(ideaTestContent)
  await page.getByRole("button", { name: "恢复草稿" }).click()
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue("后退后可以恢复")
  page.once("dialog", (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByRole("button", { name: "恢复草稿" })).toBeVisible()
  await page.getByRole("button", { name: "丢弃本地草稿" }).click()
  await expect(page.getByRole("status")).not.toContainText("未保存")
})

test("return confirmation can be refused without losing content", async ({ page }) => {
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("不离开")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("button", { name: "返回列表" }).click()
  await expect(page).toHaveURL(/document-workflow/)
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue("不离开")
})

test("existing article local drafts remain recoverable after the upgrade", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("qz-post-draft:document-test-post", JSON.stringify({
      savedAt: Date.now(), data: {
        title: "旧版草稿", content: "保留旧草稿正文", excerpt: "", categoryId: "", tags: "", publishedAt: "",
      },
    }))
  })
  await page.goto("/document-workflow?kind=post")
  await page.getByRole("button", { name: "恢复草稿" }).click()
  await expect(page.getByRole("textbox", { name: "标题", exact: true })).toHaveValue("旧版草稿")
  await expect(page.locator(".ProseMirror")).toContainText("保留旧草稿正文")
  acceptDiscard(page)
  await page.getByRole("button", { name: "取消编辑" }).click()
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("qz-post-draft:document-test-post"))).toBeNull()
})

test("existing post reads first; same-area preview retains final input, caret and undo", async ({ page }) => {
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post")
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  await expect(page.locator(".ProseMirror")).toHaveCount(0)
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.locator("p").first().click()
  await page.keyboard.press("Home")
  await page.keyboard.insertText("最后输入")
  const selection = await editor.evaluate(() => ({ offset: window.getSelection()?.anchorOffset }))
  await page.getByRole("tab", { name: "预览" }).click()
  await expect(page.getByRole("article", { name: "文章预览" })).toContainText("最后输入")
  await expect(editor).toBeHidden()
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  expect(await editor.evaluate(() => ({ offset: window.getSelection()?.anchorOffset }))).toEqual(selection)
  await page.keyboard.press("Control+z")
  await expect(editor).not.toContainText("最后输入")
  expect(writes).toHaveLength(0)
})

test("post saves its current snapshot and keeps publication actions explicit", async ({ page }) => {
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post&edit=1")
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.locator("p").first().click()
  await page.keyboard.press("Home")
  await page.keyboard.insertText("立即保存")
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await expect(page.getByRole("article", { name: "文章阅读" })).toContainText("立即保存")
  expect(writes[0].status).toBe("PUBLISHED")
  expect(writes[0].content).toContain("立即保存")
  expect(await page.evaluate((key) => localStorage.getItem(key), postKey)).toBeNull()
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await expect(editor).toBeVisible()
  await page.getByRole("button", { name: "撤回为草稿", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("草稿")
  expect(writes[1].status).toBe("DRAFT")
  expect(writes[1]).not.toHaveProperty("content")
})

test("opening the editor and preview without changes preserves the original Markdown", async ({ page }) => {
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post&edit=1")
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await page.getByRole("tab", { name: "预览" }).click()
  await expect(page.getByRole("status")).toHaveText("已发布")
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("只改标题")
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  expect(writes[0]).not.toHaveProperty("content")
})

test("new documents start editing and cancellation returns to the list", async ({ page }) => {
  await page.goto("/document-workflow?fresh=1")
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "取消编辑" }).click()
  await expect(page).toHaveURL(/\/admin\/ideas$/)
  await page.goto("/document-workflow?kind=post&fresh=1")
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await page.getByRole("button", { name: "取消编辑" }).click()
  await expect(page).toHaveURL(/\/admin\/posts$/)
})

for (const width of [390, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test("reading and toolbar fit " + width + "px in " + theme, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme)
      await page.goto("/document-workflow")
      if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"))
      const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await noOverflow()
      const code = page.locator(".admin-reading pre").first()
      expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      expect(await code.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("pre")
      await page.screenshot({ path: path.resolve("backups/document-reading-qa/" + width + "-" + theme + "-idea-reading.png") })
      await page.goto("/document-workflow?kind=post")
      if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"))
      await noOverflow()
      await expect(page.locator(".admin-reading table")).toHaveCount(1)
      await page.screenshot({ path: path.resolve("backups/document-reading-qa/" + width + "-" + theme + "-post-reading.png") })
      await page.locator(".admin-reading img").click()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "编辑", exact: true }).click()
      await expect(page.locator(".ProseMirror")).toBeVisible()
      const writingWidth = await page.locator(".ProseMirror").evaluate((element) => {
        const style = getComputedStyle(element)
        return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      })
      expect(writingWidth).toBeGreaterThanOrEqual(Math.min(640, width * 0.6))
      await page.evaluate(() => window.scrollTo(0, 1800))
      const bar = page.locator(".document-action-bar")
      expect((await bar.boundingBox())?.y).toBeGreaterThanOrEqual(0)
      expect((await bar.boundingBox())?.y).toBeLessThan(2)
      const toolbar = await page.locator(".milkdown-top-bar").boundingBox()
      const bounds = await bar.boundingBox()
      if (toolbar && bounds) expect(toolbar.y).toBeGreaterThanOrEqual(bounds.height - 1)
      await noOverflow()
      await page.screenshot({ path: path.resolve("backups/document-reading-qa/" + width + "-" + theme + "-post-editing.png") })
    })
  }
}
