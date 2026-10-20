import { expect, test, type Locator, type Page } from "@playwright/test"
import path from "node:path"
import { readerCopySource, readerPlainSource } from "../fixtures/reader-interactions"

async function openReader(page: Page) {
  await page.goto("/reader-interactions")
  await expect(page.locator("[data-reader-one] img").first()).toBeVisible()
}

async function openImage(page: Page, name = "长图") {
  const trigger = page.locator("[data-reader-one]").getByRole("button", { name, exact: true })
  await trigger.focus()
  await trigger.press("Enter")
  const dialog = page.getByRole("dialog", { name: "图片预览" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "关闭图片预览" })).toBeFocused()
  await expect(dialog.locator("img")).toHaveJSProperty("complete", true)
  return { trigger, dialog }
}

async function focusStaysInside(dialog: Locator, page: Page) {
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab")
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Shift+Tab")
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
}

test("an image with intentionally empty alt still has a named preview control", async ({ page }) => {
  await openReader(page)
  const trigger = page.locator("[data-decorative-reader]").getByRole("button", { name: "图片预览", exact: true })
  await expect(trigger).toHaveAttribute("alt", "")
  await trigger.press("Enter")
  await expect(page.getByRole("dialog", { name: "图片预览" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()
})

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`lightbox isolates background, restores focus and supports repeated opens ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openReader(page)
      if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"))
      const previousOverflow = await page.evaluate(() => document.body.style.overflow)
      const { trigger, dialog } = await openImage(page)
      await expect(page.locator("dialog[open]")).toHaveCount(1)
      expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true)
      await focusStaysInside(dialog, page)
      await page.locator("#background-action").evaluate((element) => (element as HTMLElement).focus())
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await page.mouse.click(50, 40)
      await expect(page.locator("#background-action")).toHaveText("背景按钮 0")
      // If clicking the empty backdrop closed it, reopen to verify keyboard dismissal too.
      if (!(await dialog.isVisible())) await trigger.press("Enter")
      await page.keyboard.press("Escape")
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow)
      await trigger.press("Space")
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "关闭图片预览" }).click()
      await expect(trigger).toBeFocused()
      await page.locator("[data-reader-two]").getByRole("button", { name: "另一篇图片" }).click()
      await expect(page.locator("dialog[open]")).toHaveCount(1)
      await expect(page.getByRole("dialog").getByRole("button", { name: "下一张图片" })).toHaveCount(0)
      await page.keyboard.press("Escape")
    })

    test(`full-size long image exposes all corners and gallery originals ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openReader(page)
      if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"))
      const inline = page.locator("[data-reader-one] img").first()
      await expect(inline).toHaveAttribute("width", "240")
      await expect(inline).toHaveAttribute("title", "原图说明")
      expect((await inline.boundingBox())!.width).toBeLessThanOrEqual(240)
      const { dialog } = await openImage(page)
      await expect(dialog.getByRole("link", { name: "打开原图" })).toHaveAttribute("href", "/reader-tall.svg")
      const viewport = dialog.locator("[data-image-viewport]")
      const fitted = (await dialog.locator("img").boundingBox())!
      const bounds = (await viewport.boundingBox())!
      expect(fitted.width).toBeLessThanOrEqual(bounds.width + 1)
      expect(fitted.height).toBeLessThanOrEqual(bounds.height + 1)
      await dialog.getByRole("button", { name: "按原尺寸查看" }).click()
      await expect(viewport).toBeFocused()
      await expect.poll(async () => (await dialog.locator("img").boundingBox())!.width).toBe(1800)
      expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth && element.scrollHeight > element.clientHeight)).toBe(true)
      const assertCorner = async (horizontal: "left" | "right", vertical: "top" | "bottom") => {
        const position = await viewport.evaluate((element) => ({
          left: element.scrollLeft, top: element.scrollTop,
          maxLeft: element.scrollWidth - element.clientWidth,
          maxTop: element.scrollHeight - element.clientHeight,
        }))
        expect(position.left).toBeCloseTo(horizontal === "left" ? 0 : position.maxLeft, 0)
        expect(position.top).toBeCloseTo(vertical === "top" ? 0 : position.maxTop, 0)
      }
      await viewport.press("Home")
      await assertCorner("left", "top")
      await viewport.press("ArrowRight")
      await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      await viewport.press("PageDown")
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      await viewport.press("End")
      await assertCorner("right", "bottom")
      await viewport.evaluate((element) => { element.scrollTop = 0 })
      await assertCorner("right", "top")
      await viewport.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = element.scrollHeight })
      await assertCorner("left", "bottom")
      await page.screenshot({ path: path.resolve(`backups/article-reading-qa/lightbox-${width}-${theme}-full-size.png`) })
      await dialog.getByRole("button", { name: "适应窗口" }).click()
      await viewport.press("ArrowRight")
      await expect(dialog.locator("img")).toHaveAttribute("src", "/reader-wide.svg")
      await expect(dialog.getByRole("link", { name: "打开原图" })).toHaveAttribute("href", "/reader-wide.svg")
      await dialog.getByRole("button", { name: "下一张图片" }).click()
      await expect(dialog.locator("img")).toHaveAttribute("src", "/reader-small.svg")
      await dialog.getByRole("button", { name: "上一张图片" }).click()
      await expect(dialog.locator("img")).toHaveAttribute("src", "/reader-wide.svg")
      await page.keyboard.press("Escape")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  }
}

test("copy preserves exact highlighted and plain source; Mermaid remains a diagram", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => {
      (window as unknown as { copied: string }).copied = text
    } } })
  })
  await openReader(page)
  const blocks = page.locator("[data-code-block]")
  await expect(blocks).toHaveCount(3)
  await expect(blocks.first().locator(".hljs-keyword").first()).toBeVisible()
  const expected = [readerCopySource, readerPlainSource, "<br>\n<br />"]
  for (let index = 0; index < expected.length; index += 1) {
    await blocks.nth(index).getByRole("button", { name: "复制代码" }).click()
    await expect(blocks.nth(index).getByRole("status")).toHaveText("已复制")
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(expected[index])
  }
  await expect(page.getByLabel("流程图").locator("svg")).toBeVisible({ timeout: 30_000 })
  expect(await page.locator("[data-reader-one]").textContent()).not.toContain("[object Object]")
})

test("copy rejection and failed fallback announce failure without false success", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied") } } })
    document.execCommand = () => false
  })
  await openReader(page)
  const block = page.locator("[data-code-block]").first()
  await block.getByRole("button", { name: "复制代码" }).click()
  await expect(block.getByRole("status")).toHaveText("复制失败，请选择代码后手动复制")
  await expect(block.getByRole("button", { name: "复制代码" })).toBeFocused()
  await expect(block).not.toContainText("已复制")
})

test("unavailable Clipboard API uses a verified fallback with exact text and restored focus", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
    document.execCommand = (command) => {
      if (command !== "copy") return false
      const field = document.activeElement
      if (!(field instanceof HTMLTextAreaElement)) return false
      ;(window as unknown as { copied: string }).copied = field.value
      return true
    }
  })
  await openReader(page)
  const block = page.locator("[data-code-block]").first()
  const button = block.getByRole("button", { name: "复制代码" })
  await button.click()
  await expect(block.getByRole("status")).toHaveText("已复制")
  await expect(button).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(readerCopySource)
  await expect(page.locator("textarea")).toHaveCount(0)
})

test("touch gestures pan the original-size image in both directions", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "This touch-input regression requires Chromium's CDP Input.dispatchTouchEvent.")
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await context.newPage()
  try {
    await page.goto((test.info().project.use.baseURL ?? "http://localhost:3220") + "/reader-interactions")
    const { dialog } = await openImage(page)
    await dialog.getByRole("button", { name: "按原尺寸查看" }).click()
    const viewport = dialog.locator("[data-image-viewport]")
    const bounds = (await viewport.boundingBox())!
    const client = await context.newCDPSession(page)
    const x = bounds.x + bounds.width * 0.75
    const y = bounds.y + bounds.height * 0.65
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(0)
    expect(await viewport.evaluate((element) => element.scrollTop)).toBe(0)
    // Native Chromium locks a diagonal gesture to its dominant axis. Verify
    // both pan directions with separate real touch gestures, not one diagonal.
    for (const [dx, dy] of [[20, 0], [0, 30]]) {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      for (let step = 1; step <= 8; step += 1) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x: x - step * dx, y: y - step * dy }],
        })
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await expect.poll(() => viewport.evaluate((element, horizontal) =>
        horizontal ? element.scrollLeft : element.scrollTop, dx !== 0)).toBeGreaterThan(0)
    }
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await context.close()
  }
})

test("unmounting an open reader cleans up the modal and body scroll lock", async ({ page }) => {
  await openReader(page)
  const previousOverflow = await page.evaluate(() => document.body.style.overflow)
  await openImage(page)
  // Simulate a parent route/content replacement, not a user click through the inert background.
  await page.getByRole("button", { name: "切换阅读组件" }).evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.locator("dialog[open]")).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow)
  await page.locator("#background-action").click()
  await expect(page.locator("#background-action")).toHaveText("背景按钮 1")
})

test("responsive display selects a variant while lightbox always opens the original", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openReader(page)
  const inline = page.locator("[data-responsive-reader] img")
  await inline.scrollIntoViewIfNeeded()
  await expect(inline).toHaveAttribute("width", "1600")
  await expect(inline).toHaveAttribute("height", "900")
  await expect(inline).toHaveAttribute("data-original-src", "/reader-responsive.png")
  await expect(inline).toHaveAttribute("sizes", "(max-width: 288px) calc(100vw - 48px), 240px")
  await expect.poll(() => inline.evaluate((element) => (element as HTMLImageElement).currentSrc)).toMatch(/reader-responsive-\d+\.webp$/)
  const dimensions = (await inline.boundingBox())!
  expect(dimensions.width).toBe(240)
  expect(dimensions.height).toBe(135)
  await inline.click()
  const dialog = page.getByRole("dialog", { name: "图片预览" })
  await expect(dialog.locator("img")).toHaveAttribute("src", "/reader-responsive.png")
  await expect(dialog.locator("img")).not.toHaveAttribute("srcset")
  await expect(dialog.getByRole("link", { name: "打开原图" })).toHaveAttribute("href", "/reader-responsive.png")
  await dialog.getByRole("button", { name: "按原尺寸查看" }).click()
  await expect.poll(async () => (await dialog.locator("img").boundingBox())!.width).toBe(1600)
})
