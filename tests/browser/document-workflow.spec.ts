import { expect, test, type Page } from "@playwright/test"
import { ideaTestContent, postTestContent } from "../fixtures/document-content"
import path from "node:path"
import { validatePostUpdate } from "../../lib/validation"
import { scanPublicationContent } from "../../lib/publication-content"

const owner = "document-test-owner"
const ideaKey = "qz-idea-draft:" + owner + ":document-test-idea"
const postKey = "qz-post-draft:" + owner + ":document-test-post"

const embeddedPngHeader = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")

async function mockValidatedPostSave(page: Page, title: string, writes: Record<string, unknown>[]) {
  await page.route("**/api/posts/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    try { validatePostUpdate(body) } catch (error) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: (error as Error).message }) })
      return
    }
    writes.push(body)
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: "document-test-post", title, content: "", excerpt: "", categoryId: null,
      seriesId: null, seriesOrder: null, tags: [], publishedAt: null, ...body,
    }) })
  })
}

function acceptDiscard(page: Page) {
  page.once("dialog", (dialog) => dialog.accept())
}

async function confirmPublicationWarnings(page: Page, waitForEditorCallback = false) {
  await expect(page.getByRole("heading", { name: /发布前有.*处内容需要确认/ })).toBeVisible()
  if (waitForEditorCallback) {
    // Deliberately cross Milkdown's serialization debounce: identical callbacks
    // after embedded-image URL replacement must not erase the review panel.
    await page.waitForTimeout(500)
    await expect(page.getByRole("heading", { name: /发布前有.*处内容需要确认/ })).toBeVisible()
  }
  await page.getByRole("checkbox", { name: /我已核对这些提示/ }).check()
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
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
  await page.getByRole("button", { name: "保存素材" }).click()
  await expect(page.getByRole("article", { name: "Idea 阅读" })).toContainText("已保存正文")
  expect(writes).toEqual([{ content: "已保存正文\n    原始缩进" }])
  await expect(page.locator(".document-action-bar").getByRole("status")).not.toContainText("未保存")
  expect(await page.evaluate((key) => localStorage.getItem(key), ideaKey)).toBeNull()
})

test("failed save keeps draft and browser storage errors are visible", async ({ page }) => {
  await mockSave(page, "idea", true)
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("失败后保留")
  await page.getByRole("button", { name: "保存素材" }).click()
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
  await expect(page.locator(".document-action-bar").getByRole("status")).not.toContainText("未保存")
})

test("return confirmation can be refused without losing content", async ({ page }) => {
  await page.goto("/document-workflow?edit=1")
  await page.getByRole("textbox", { name: "正文", exact: true }).fill("不离开")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("button", { name: "返回列表" }).click()
  await expect(page).toHaveURL(/document-workflow/)
  await expect(page.getByRole("textbox", { name: "正文", exact: true })).toHaveValue("不离开")
})

for (const storageKey of ["qz-post-draft:document-test-post", postKey]) {
test(`existing article local drafts remain recoverable after the upgrade (${storageKey})`, async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(), data: {
        title: "旧版草稿", content: "保留旧草稿正文", excerpt: "", categoryId: "", tags: "", publishedAt: "",
      },
    }))
  }, storageKey)
  await page.goto("/document-workflow?kind=post")
  await page.getByRole("button", { name: "恢复草稿" }).click()
  await expect(page.getByRole("textbox", { name: "标题", exact: true })).toHaveValue("旧版草稿")
  await expect(page.locator(".ProseMirror")).toContainText("保留旧草稿正文")
  await expect(page.getByLabel("内容形式", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("阅读提示（可选）", { exact: true })).toHaveValue("")
  acceptDiscard(page)
  await page.getByRole("button", { name: "取消编辑" }).click()
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
})
}

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
  await expect(page.locator(".document-action-bar").getByRole("status")).toHaveText("草稿")
  expect(writes[1].status).toBe("DRAFT")
  expect(writes[1]).not.toHaveProperty("content")
})

test("PostForm preserves image width, alt and caption through API save, reading and reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post&edit=1")
  const block = page.locator(".editor-image-block").first()
  await expect(block).toBeVisible()
  await block.getByRole("button", { name: "图片设置", exact: true }).click()
  await block.getByLabel("显示宽度（像素）").fill("600")
  await block.getByLabel("替代文本", { exact: true }).fill("深蓝背景上的圆形与三条说明线")
  await block.getByLabel("图片说明", { exact: true }).fill("人工构造的回归测试插图")
  await block.getByRole("button", { name: "应用图片设置" }).click()
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  const reader = page.getByRole("article", { name: "文章阅读", exact: true })
  await expect(reader).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0].content).toContain('![深蓝背景上的圆形与三条说明线](/test-document-image.svg "人工构造的回归测试插图 {qz-width=600}")')
  const image = reader.locator("img")
  await expect(image).toHaveAttribute("alt", "深蓝背景上的圆形与三条说明线")
  await expect(image).toHaveAttribute("title", "人工构造的回归测试插图")
  await expect.poll(() => image.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(600, 0)
  expect(await page.evaluate((key) => localStorage.getItem(key), postKey)).toBeNull()
  await page.getByRole("button", { name: "编辑", exact: true }).click()
  await expect(block.locator("img")).toHaveAttribute("width", "600")
  await expect(block.locator("img")).toHaveAttribute("alt", "深蓝背景上的圆形与三条说明线")
  await expect(block.locator("img")).toHaveAttribute("title", "人工构造的回归测试插图")
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  const previewImage = page.getByRole("article", { name: "文章预览", exact: true }).locator("img")
  await expect(previewImage).toHaveAttribute("width", "600")
  await expect.poll(() => previewImage.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(600, 0)
  expect(writes).toHaveLength(1)
})

test("post saves pasted embedded images as uploaded URLs instead of base64", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  const writes = await mockSave(page, "post")
  const uploads: string[] = []
  await page.route("**/api/upload", async (route) => {
    uploads.push(route.request().method())
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ url: "/uploads/pasted-image.png" }) })
  })
  await page.route("**/uploads/pasted-image.png", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }))
  await page.goto("/document-workflow?kind=post&edit=1")
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.locator("p").first().click()
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer()
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    clipboard.setData("text/html", `<p>粘贴图片前<img src="${image}">粘贴图片后</p>`)
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }))
  })
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await expect(editor.locator('img[src="/uploads/pasted-image.png"]')).toHaveCount(1)
  await expect(editor.locator('img[src^="data:"]')).toHaveCount(0)
  await confirmPublicationWarnings(page, true)
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(uploads).toEqual(["POST"])
  expect(writes[0].content).toContain("/uploads/pasted-image.png")
  expect(writes[0].content).not.toContain("data:image/")
  expect(writes[0].content).toContain("粘贴图片前")
  expect(writes[0].content).toContain("粘贴图片后")
  await page.screenshot({ path: path.resolve("backups/document-reading-qa/embedded-image-saved-light.png") })
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  await page.screenshot({ path: path.resolve("backups/document-reading-qa/embedded-image-saved-dark.png") })
})

for (const mime of ["image/png", "application/octet-stream"]) {
test(`post saves six embedded images restored from a legacy draft (${mime}) without exceeding the body limit`, async ({ page, browserName }) => {
  // Baseline WebKit in the constrained runner takes ~27s to parse this >2MB
  // legacy draft. Keep its full payload and a bounded functional wait; this is
  // not a performance pass and does not loosen the normal Chromium gate.
  if (browserName === "webkit") test.setTimeout(180_000)
  const header = embeddedPngHeader
  const content = JSON.stringify({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "合成六图草稿" }] },
    ...Array.from({ length: 6 }, (_, index) => ({ type: "image", attrs: {
      src: `data:${mime};base64,` + Buffer.concat([header, Buffer.alloc(250_000, index)]).toString("base64"),
      alt: `图片${index + 1}`,
    } })),
  ] })
  expect(content.length).toBeGreaterThan(2_000_000)
  await page.addInitScript(({ key, content }) => {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: {
      title: "合成六图草稿", content, excerpt: "", categoryId: "", seriesId: "", seriesOrder: "", tags: "", publishedAt: "",
    } }))
  }, { key: postKey, content })
  let uploads = 0
  const writes: Record<string, unknown>[] = []
  await page.route("**/api/upload", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ url: `/uploads/restored-image-${++uploads}.png` }) }))
  await page.route("**/uploads/restored-image-*.png", (route) => route.fulfill({ contentType: "image/png", body: header }))
  await mockValidatedPostSave(page, "合成六图草稿", writes)
  await page.goto("/document-workflow?kind=post&edit=1")
  await page.getByRole("button", { name: "恢复草稿", exact: true }).click()
  await expect(page.locator(".ProseMirror img")).toHaveCount(6, browserName === "webkit" ? { timeout: 60_000 } : {})
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await confirmPublicationWarnings(page, true)
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(uploads).toBe(6)
  expect(writes).toHaveLength(1)
  expect(writes[0].content).not.toContain("data:")
  expect(String(writes[0].content).length).toBeLessThan(1000)
  expect(writes[0].content).toContain("合成六图草稿")
  await expect(page.getByRole("article", { name: "文章阅读" }).locator("img")).toHaveCount(6)
  await page.screenshot({ path: path.resolve("backups/document-reading-qa/six-images-saved-light.png") })
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  await page.screenshot({ path: path.resolve("backups/document-reading-qa/six-images-saved-dark.png") })
})
}

test("post saves six pasted PNG images with generic MIME types without exceeding the body limit", async ({ page, browserName }) => {
  if (browserName === "webkit") test.setTimeout(180_000)
  const header = embeddedPngHeader
  const html = Array.from({ length: 6 }, (_, index) => {
    const source = "data:application/octet-stream;base64," + Buffer.concat([header, Buffer.alloc(250_000, index)]).toString("base64")
    return `<p><img src="${source}" alt="图片${index + 1}"></p>`
  }).join("")
  expect(html.length).toBeGreaterThan(2_000_000)
  let uploads = 0
  const writes: Record<string, unknown>[] = []
  await page.route("**/api/upload", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ url: `/uploads/pasted-generic-${++uploads}.png` }) }))
  await page.route("**/uploads/pasted-generic-*.png", (route) => route.fulfill({ contentType: "image/png", body: header }))
  await mockValidatedPostSave(page, "合成粘贴六图", writes)
  await page.goto("/document-workflow?kind=post&edit=1")
  const editor = page.locator(".ProseMirror")
  await expect(editor).toBeVisible()
  await editor.locator("p").first().click()
  await editor.evaluate((element, html) => {
    const clipboard = new DataTransfer()
    clipboard.setData("text/html", html)
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }))
  }, html)
  // Crepe renders an empty placeholder beside each pasted image; count sources.
  await expect(editor.locator('img[src^="data:application/octet-stream;"]')).toHaveCount(6, browserName === "webkit" ? { timeout: 60_000 } : {})
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await confirmPublicationWarnings(page, true)
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(uploads).toBe(6)
  expect(writes).toHaveLength(1)
  expect(writes[0].content).not.toContain("data:")
  expect(String(writes[0].content).length).toBeLessThan(10_000)
  await expect(page.getByRole("article", { name: "文章阅读" }).locator('img[src^="/uploads/pasted-generic-"]')).toHaveCount(6)
  await expect(page.getByRole("article", { name: "文章阅读" }).locator('img[src="/test-document-image.svg"]')).toHaveCount(1)
})

test("opening the editor and preview without changes preserves the original Markdown", async ({ page }) => {
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post&edit=1")
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await page.getByRole("tab", { name: "预览" }).click()
  await expect(page.locator(".document-action-bar").getByRole("status")).toHaveText("已发布")
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


test("publication warnings need explicit review and reset after content metadata changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const content = "```python\nlabel = 'a\u00a0b'\n```\n\n![1.00](/test-document-image.svg)"
  await page.addInitScript(({ key, content }) => {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: {
      title: "发布复核演示", content, excerpt: "说明不可见字符的有意用法。", categoryId: "", seriesId: "", seriesOrder: "", tags: "", publishedAt: "",
    } }))
  }, { key: postKey, content })
  const writes = await mockSave(page, "post")
  await page.goto("/document-workflow?kind=post&edit=1")
  await page.getByRole("button", { name: "恢复草稿", exact: true }).click()
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await page.getByLabel("内容形式", { exact: true }).selectOption("STUDY_NOTE")
  await page.getByLabel("阅读提示（可选）", { exact: true }).fill("约 5 分钟，含代码示例")
  await page.getByRole("tab", { name: "预览", exact: true }).click()
  const preview = page.getByRole("region", { name: "发布效果预览", exact: true })
  await expect(preview).toContainText("说明不可见字符的有意用法。")
  await expect(preview).toContainText("学习笔记 · 约 5 分钟，含代码示例")
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await expect(page.getByRole("heading", { name: /发布前有.*处内容需要确认/ })).toBeVisible()
  await expect(page.locator("#publication-review-title").locator("..")).toContainText("U+00A0")
  expect(writes).toHaveLength(0)
  await page.getByRole("checkbox", { name: /我已核对这些提示/ }).check()
  await page.getByRole("tab", { name: "编辑", exact: true }).click()
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("更新后的发布复核演示")
  await page.getByRole("button", { name: "更新发布", exact: true }).click()
  await expect(page.getByRole("checkbox", { name: /我已核对这些提示/ })).not.toBeChecked()
  expect(writes).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: path.resolve("backups/document-reading-qa/publication-review-mobile.png") })
  await confirmPublicationWarnings(page)
  await expect(page.getByRole("article", { name: "文章阅读" })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0].contentFormat).toBe("STUDY_NOTE")
  expect(writes[0].readHint).toBe("约 5 分钟，含代码示例")
  expect(writes[0].publicationReviewToken).toBe(scanPublicationContent(writes[0]).reviewToken)
  expect(writes[0].content).toContain("a\u00a0b")
})
