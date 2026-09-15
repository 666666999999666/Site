import { expect, test, type Locator, type Page } from "@playwright/test"

async function expectReadable(option: Locator) {
  const contrast = await option.evaluate((element) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const context = canvas.getContext("2d")!
    function luminance(color: string) {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      const linear = [r, g, b].map((channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    }
    const style = getComputedStyle(element)
    let background = style.backgroundColor
    let parent = element.parentElement
    while (background === "rgba(0, 0, 0, 0)" && parent) {
      background = getComputedStyle(parent).backgroundColor
      parent = parent.parentElement
    }
    const foregroundLuminance = luminance(style.color)
    const backgroundLuminance = luminance(background)
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
}

async function expectWithinViewport(page: Page) {
  const popup = await page.getByRole("listbox").boundingBox()
  const viewport = page.viewportSize()!
  expect(popup).not.toBeNull()
  expect(popup!.x).toBeGreaterThanOrEqual(0)
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(viewport.width)
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`question library filters remain readable and usable in ${theme} at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      // An explicit site theme must work even when the system theme is the opposite.
      await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" })
      const queries: URLSearchParams[] = []
      await page.route("**/api/questions?*", async (route) => {
        queries.push(new URL(route.request().url()).searchParams)
        await route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, pendingCount: 2 } })
      })
      await page.goto("/question-library")
      await expect(page.getByText("没有找到匹配的题目")).toBeVisible()
      await page.evaluate((selectedTheme) => {
        document.documentElement.classList.toggle("dark", selectedTheme === "dark")
        document.documentElement.style.colorScheme = selectedTheme
      }, theme)
      const status = page.getByRole("combobox", { name: "按题目状态筛选" })
      const rating = page.getByRole("combobox", { name: "按最近评分筛选" })
      await expect(status).toContainText("可复习（默认）")
      await expect(rating).toContainText("全部最近评分")

      await status.click()
      const statusOptions = page.getByRole("listbox").getByRole("option")
      await expect(statusOptions).toHaveCount(7)
      for (const option of await statusOptions.all()) {
        await expect(option).toBeVisible()
        await expectReadable(option)
      }
      await expectWithinViewport(page)
      const pendingOption = statusOptions.filter({ hasText: "待补答案" })
      await pendingOption.hover()
      await expectReadable(pendingOption)
      await page.screenshot({ path: testInfo.outputPath(`status-${theme}-${viewport.width}.png`), fullPage: true })
      await pendingOption.click()
      await expect(status).toContainText("待补答案")
      await expect.poll(() => queries.at(-1)?.get("status")).toBe("PENDING")

      // Keyboard navigation must reach the disabled questions and preserve focus.
      await status.focus()
      await status.press("ArrowDown")
      await expect(page.getByRole("listbox")).toBeVisible()
      await page.keyboard.press("End")
      await page.keyboard.press("Enter")
      await expect(status).toContainText("已停用")
      await expect.poll(() => queries.at(-1)?.get("status")).toBe("DISABLED")
      await expect(status).toBeFocused()

      await rating.click()
      const ratingOptions = page.getByRole("listbox").getByRole("option")
      await expect(ratingOptions).toHaveCount(6)
      for (const option of await ratingOptions.all()) {
        await expect(option).toBeVisible()
        await expectReadable(option)
      }
      await expectWithinViewport(page)
      const goodOption = ratingOptions.filter({ hasText: "良好" })
      await goodOption.hover()
      await expectReadable(goodOption)
      await page.screenshot({ path: testInfo.outputPath(`rating-${theme}-${viewport.width}.png`), fullPage: true })
      await goodOption.click()
      await expect.poll(() => queries.at(-1)?.get("rating")).toBe("GOOD")
      expect(queries.at(-1)?.get("status")).toBe("DISABLED")

      await status.click()
      await page.getByRole("listbox").getByRole("option", { name: "可复习（默认）", exact: true }).click()
      await expect.poll(() => queries.at(-1)?.has("status")).toBe(false)
      await rating.click()
      await page.getByRole("listbox").getByRole("option", { name: "全部最近评分", exact: true }).click()
      await expect.poll(() => queries.at(-1)?.has("rating")).toBe(false)
    })
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`question preview, reveal and history share readable ${theme} typography`, async ({ page }, testInfo) => {
    await page.goto("/question-display")
    await page.evaluate((selectedTheme) => {
      document.documentElement.classList.toggle("dark", selectedTheme === "dark")
      document.documentElement.style.colorScheme = selectedTheme
    }, theme)

    const source = page.getByRole("textbox", { name: "标准答案" })
    const previewParagraph = page.getByRole("region", { name: "标准答案预览" }).locator(".prose p").first()
    const revealedParagraph = page.getByRole("region", { name: "正式揭晓" }).locator(".prose p").first()
    const historyParagraph = page.getByRole("region", { name: "历史答案" }).locator(".prose p").first()
    const styles = await Promise.all([source, previewParagraph, revealedParagraph, historyParagraph].map(
      (locator) => locator.evaluate((element) => {
        const style = getComputedStyle(element)
        return { fontSize: style.fontSize, lineHeight: style.lineHeight }
      })
    ))
    expect(new Set(styles.map(({ fontSize }) => fontSize)).size).toBe(1)
    expect(new Set(styles.map(({ lineHeight }) => lineHeight)).size).toBe(1)
    await page.screenshot({
      path: testInfo.outputPath(`question-display-${theme}.png`),
      fullPage: true,
    })
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`native selects expose readable ${theme} popup colors`, async ({ page }) => {
    await page.route("**/api/questions?*", (route) => route.fulfill({
      json: { items: [], total: 0, page: 1, pageSize: 20, pendingCount: 2 },
    }))
    await page.goto("/question-library")
    await page.evaluate((selectedTheme) => {
      document.documentElement.classList.toggle("dark", selectedTheme === "dark")
      document.documentElement.style.colorScheme = selectedTheme
    }, theme)

    const select = page.getByRole("combobox", { name: "原生下拉框主题验收" })
    await expect(select).toBeVisible()
    await expect(select).toHaveCSS("color-scheme", theme)
    for (const option of await select.locator("option").all()) {
      await expectReadable(option)
    }
  })
}
