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

test("table insertion asks for dimensions and renders clear borders in both themes", async ({ page }) => {
  await openEditor(page)
  await setCaret(page, ".ProseMirror > p:first-child", 5)

  const tableButton = page.getByRole("button", { name: "插入表格" })
  const tableButtonBox = await tableButton.boundingBox()
  expect(tableButtonBox).not.toBeNull()
  await page.mouse.move(
    tableButtonBox!.x + tableButtonBox!.width / 2,
    tableButtonBox!.y + tableButtonBox!.height / 2
  )
  await page.mouse.down()
  await page.waitForTimeout(250)
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeHidden()
  await page.mouse.up()
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeVisible()
  await page.waitForTimeout(250)
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeVisible()
  await expect(page.locator(".ProseMirror table:visible")).toHaveCount(0)
  await page.getByRole("button", { name: "取消" }).click()

  await tableButton.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeVisible()
  await page.getByRole("button", { name: "取消" }).click()

  await page.locator(".ProseMirror > p:first-child").hover()
  await page.getByRole("button", { name: "在下方插入内容" }).click()
  const blockTableItem = page.locator(".milkdown-slash-menu").getByText("Table", { exact: true })
  await expect(blockTableItem).toBeVisible()
  await blockTableItem.click()
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeVisible()
  await page.waitForTimeout(250)
  await expect(page.getByRole("heading", { name: "插入表格" })).toBeVisible()
  await expect(page.locator(".ProseMirror table:visible")).toHaveCount(0)

  await page.getByLabel("行数（含表头）").selectOption("4")
  await page.getByLabel("列数").selectOption("2")
  await page.screenshot({ path: "test-results/editor-table-dialog-light.png", fullPage: false })
  const insertButton = page.getByRole("button", { name: "插入 4×2 表格" })
  const insertButtonBox = await insertButton.boundingBox()
  expect(insertButtonBox).not.toBeNull()
  await page.mouse.click(
    insertButtonBox!.x + insertButtonBox!.width / 2,
    insertButtonBox!.y + insertButtonBox!.height / 2
  )

  const table = page.locator(".ProseMirror table:visible").first()
  await expect(table).toBeVisible()
  await expect(table.locator("tr")).toHaveCount(4)
  await expect(table.locator("tr").first().locator("th")).toHaveCount(2)
  await expect(table.locator("tr").nth(1).locator("td")).toHaveCount(2)

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark)
    const border = await table.locator("td").first().evaluate((cell) => {
      const style = getComputedStyle(cell)
      return { color: style.borderTopColor, width: style.borderTopWidth }
    })
    expect(border.width).toBe("1px")
    expect(border.color).not.toBe("rgba(0, 0, 0, 0)")
    expect(border.color).not.toBe("transparent")
    await page.screenshot({
      path: `test-results/editor-table-${dark ? "dark" : "light"}.png`,
      fullPage: false,
    })
  }
})

test("daily sidebar children stay collapsed until requested and open on child pages", async ({ page }) => {
  await page.goto("/sidebar")
  const navigation = page.getByRole("navigation")
  await expect(navigation.getByRole("link", { name: "历史记录" })).toBeHidden()
  await expect(navigation.getByRole("link", { name: "每日提醒语" })).toBeHidden()

  await navigation.getByRole("button", { name: "展开每日三件事菜单" }).click()
  await expect(navigation.getByRole("link", { name: "历史记录" })).toBeVisible()
  await expect(navigation.getByRole("link", { name: "每日提醒语" })).toBeVisible()
  await page.screenshot({ path: "test-results/admin-sidebar-expanded.png", fullPage: false })

  await navigation.getByRole("button", { name: "收起每日三件事菜单" }).click()
  await expect(navigation.getByRole("link", { name: "历史记录" })).toBeHidden()

  await page.goto("/admin/daily/history")
  await expect(page.getByRole("navigation").getByRole("link", { name: "历史记录" })).toBeVisible()
})

test("desktop admin sidebar collapses to an accessible icon rail", async ({ page }) => {
  await page.goto("/sidebar")

  const sidebar = page.getByRole("complementary", { name: "后台侧栏" })
  const navigation = sidebar.getByRole("navigation", { name: "后台导航" })
  const overview = navigation.getByRole("link", { name: "概览" })
  const collapse = sidebar.getByRole("button", { name: "收起后台侧栏" })

  await expect(sidebar).toHaveCSS("width", "224px")
  await page.screenshot({ path: "test-results/admin-sidebar-expanded-light.png", fullPage: false })
  await collapse.click()

  const expand = sidebar.getByRole("button", { name: "展开后台侧栏" })
  await expect(sidebar).toHaveCSS("width", "64px")
  await expect(expand).toBeVisible()
  await expect(overview).toBeVisible()
  await expect(overview).toHaveAttribute("title", "概览")
  await expect(navigation.getByRole("button", { name: "展开每日三件事菜单" })).toHaveCount(0)
  await page.screenshot({ path: "test-results/admin-sidebar-collapsed-light.png", fullPage: false })

  await sidebar.getByRole("button", { name: "切换深色模式" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({ path: "test-results/admin-sidebar-collapsed-dark.png", fullPage: false })

  const signOut = sidebar.getByRole("button", { name: "退出登录" })
  await signOut.focus()
  await page.keyboard.press("Enter")

  await expect(sidebar).toHaveCSS("width", "224px")
  await expect(sidebar.getByRole("button", { name: "收起后台侧栏" })).toBeVisible()
  await expect(sidebar.getByText("当前设备的后台会话将失效。")).toBeVisible()
  await expect(sidebar.getByRole("button", { name: "确认退出" })).toBeVisible()
  await expect(overview).not.toHaveAttribute("title", "概览")
  await page.screenshot({ path: "test-results/admin-sidebar-expanded-dark.png", fullPage: false })
  await sidebar.getByRole("button", { name: "取消" }).focus()
  await page.keyboard.press("Enter")
  await expect(sidebar.getByText("当前设备的后台会话将失效。")).toHaveCount(0)
})

test("mobile admin navigation remains independent from the desktop sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/sidebar")

  await expect(page.getByRole("complementary", { name: "后台侧栏", includeHidden: true })).toBeHidden()

  const open = page.getByRole("button", { name: "打开后台菜单" })
  await expect(open).toBeVisible()
  await open.click()

  const navigation = page.getByRole("navigation", { name: "后台导航" })
  await expect(navigation.getByRole("link", { name: "问题中学" })).toBeVisible()
  await expect(page.getByRole("button", { name: "收起后台侧栏" })).toHaveCount(0)

  await page.getByRole("button", { name: "关闭后台菜单" }).click()
  await expect(navigation).toHaveCount(0)
})

test("top toolbar remains visible while scrolling through a long article", async ({ page }) => {
  await openEditor(page)
  const toolbar = page.locator(".milkdown-top-bar")
  await expect(toolbar).toBeVisible()

  await page.locator(".ProseMirror > *").last().scrollIntoViewIfNeeded()
  const toolbarBox = await toolbar.boundingBox()
  expect(toolbarBox).not.toBeNull()
  expect(toolbarBox!.y).toBeGreaterThanOrEqual(0)
  expect(toolbarBox!.y).toBeLessThanOrEqual(2)
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
