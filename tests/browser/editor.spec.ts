import { expect, test, type Page } from "@playwright/test"

async function setCaret(page: Page, selector: string, offset: number) {
  await page.locator(selector).evaluate((element, targetOffset) => {
    const editor = element.closest(".ProseMirror") as HTMLElement
    editor.focus()

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let remaining = targetOffset
    let node = walker.nextNode()
    while (node && remaining > (node.textContent?.length ?? 0)) {
      remaining -= node.textContent?.length ?? 0
      node = walker.nextNode()
    }

    const range = document.createRange()
    if (node) {
      range.setStart(node, Math.min(remaining, node.textContent?.length ?? 0))
    } else {
      range.setStart(element, 0)
    }
    range.collapse(true)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  }, offset)
}

async function editorBlocks(page: Page) {
  return page.locator(".ProseMirror > *").evaluateAll((elements) =>
    elements.map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }))
  )
}

async function openEditor(page: Page) {
  await page.goto("/")
  await expect(page.locator(".ProseMirror")).toBeVisible()
}

test("Enter preserves empty paragraphs and the active caret position", async ({ page }) => {
  await openEditor(page)

  await setCaret(page, ".ProseMirror > p:first-child", 5)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)

  let blocks = await editorBlocks(page)
  expect(blocks.slice(0, 3)).toEqual([
    { tag: "p", text: "ABCDE" },
    { tag: "p", text: "" },
    { tag: "h2", text: "HEADING" },
  ])
  await expect(page.getByTestId("markdown-output")).toContainText("ABCDE\n\n<br />\n\n## HEADING")

  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)
  blocks = await editorBlocks(page)
  expect(blocks.slice(0, 4).map(({ tag, text }) => [tag, text])).toEqual([
    ["p", "ABCDE"],
    ["p", ""],
    ["p", ""],
    ["h2", "HEADING"],
  ])
})

test("Enter splits text at the middle without moving the caret", async ({ page }) => {
  await openEditor(page)
  await setCaret(page, ".ProseMirror > p:first-child", 2)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)

  expect((await editorBlocks(page)).slice(0, 2)).toEqual([
    { tag: "p", text: "AB" },
    { tag: "p", text: "CDE" },
  ])
  const selection = await page.evaluate(() => {
    const current = window.getSelection()
    return { text: current?.anchorNode?.textContent, offset: current?.anchorOffset }
  })
  expect(selection).toEqual({ text: "CDE", offset: 0 })
})

test("double Enter exits lists and quotes into a persistent paragraph", async ({ page }) => {
  await openEditor(page)
  await setCaret(page, ".ProseMirror > ul li p", 9)
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)

  let blocks = await editorBlocks(page)
  expect(blocks.slice(2, 5).map(({ tag }) => tag)).toEqual(["ul", "p", "blockquote"])

  await page.reload()
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await setCaret(page, ".ProseMirror > blockquote p", 5)
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)

  blocks = await editorBlocks(page)
  expect(blocks.slice(3, 6)).toEqual([
    { tag: "blockquote", text: "QUOTE" },
    { tag: "p", text: "" },
    { tag: "p", text: "TAIL" },
  ])
})

test("the block selector converts existing text without losing content", async ({ page }) => {
  await openEditor(page)
  await setCaret(page, ".ProseMirror > p:first-child", 2)

  await page.locator(".top-bar-heading-button").click()
  await page.getByRole("button", { name: "二级标题" }).click()
  await expect(page.locator(".ProseMirror > h2").first()).toHaveText("ABCDE")

  await setCaret(page, ".ProseMirror > h2:first-child", 2)
  await page.locator(".top-bar-heading-button").click()
  await page.getByRole("button", { name: "三级标题" }).click()
  await expect(page.locator(".ProseMirror > h3")).toHaveText("ABCDE")

  await setCaret(page, ".ProseMirror > h3", 2)
  await page.locator(".top-bar-heading-button").click()
  await page.getByRole("button", { name: "正文" }).click()
  await expect(page.locator(".ProseMirror > p").first()).toHaveText("ABCDE")
})

test("editor icon controls have names and keyboard-operable block actions", async ({ page }) => {
  await openEditor(page)

  const topBarItems = page.locator(".milkdown-top-bar .top-bar-item")
  await expect(topBarItems).toHaveCount(14)
  const labels = await topBarItems.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label"))
  )
  expect(labels.every(Boolean)).toBe(true)
  expect(new Set(labels).size).toBe(14)

  await page.locator(".ProseMirror > p:first-child").hover()
  const blockActions = page.locator(".milkdown-block-handle .operation-item")
  await expect(blockActions).toHaveCount(2)
  await expect(blockActions.first()).toHaveAttribute("role", "button")
  await expect(blockActions.first()).toHaveAttribute("tabindex", "0")

  await blockActions.first().focus()
  await page.keyboard.press("Enter")
  await expect(page.locator(".milkdown-slash-menu")).toHaveAttribute("data-show", "true")
  await expect(page.locator(".ProseMirror > p").nth(1)).toBeEmpty()
})

test("drag source and drop indicator remain visible in both themes", async ({ page }) => {
  await openEditor(page)

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark)
    const paragraph = page.locator(".ProseMirror > p:first-child")
    await paragraph.hover()
    await page.waitForTimeout(250)

    const dragHandle = page.locator(".milkdown-block-handle .operation-item").last()
    const handleBox = await dragHandle.boundingBox()
    const headingBox = await page.locator(".ProseMirror > h2").boundingBox()
    expect(handleBox).not.toBeNull()
    expect(headingBox).not.toBeNull()

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(headingBox!.x + 80, headingBox!.y + headingBox!.height + 8, { steps: 12 })
    await page.waitForTimeout(250)

    await expect(page.locator(".ProseMirror")).toHaveAttribute("data-dragging", "true")
    const cursor = page.locator(".crepe-drop-cursor")
    await expect(cursor).toBeVisible()
    const cursorStyle = await cursor.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return { opacity: style.opacity, width: rect.width, height: rect.height }
    })
    expect(cursorStyle.opacity).toBe("1")
    expect(Math.min(cursorStyle.width, cursorStyle.height)).toBeGreaterThanOrEqual(3)

    const selectedStyle = await page.locator(".ProseMirror-selectednode").evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color, opacity: style.opacity }
    })
    expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)")
    expect(selectedStyle.color).not.toBe("rgba(0, 0, 0, 0)")
    expect(selectedStyle.opacity).toBe("1")
    await page.mouse.up()
    await page.reload()
    await expect(page.locator(".ProseMirror")).toBeVisible()
  }
})
