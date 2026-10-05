import { expect, test, type Page } from "@playwright/test"
import path from "node:path"

async function openReader(page: Page, theme: string, loggedIn: boolean, kind = "post") {
  await page.route("**/api/auth/check", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ isLoggedIn: loggedIn }),
  }))
  await page.goto("/reader-layout?kind=" + kind)
  if (theme === "dark") await page.getByRole("button", { name: "切换深色模式" }).click()
  await expect(page.getByRole("button", { name: "管理入口" })).toHaveAttribute("title", loggedIn ? "进入后台" : "管理登录")
}

async function assertRendering(page: Page) {
  const inline = page.locator(".markdown-reading p > code").filter({ hasText: "sample_id" })
  const pseudo = await inline.evaluate((element) => [
    getComputedStyle(element, "::before").content, getComputedStyle(element, "::after").content,
  ])
  expect(pseudo).toEqual(["none", "none"])
  await expect(page.locator(".markdown-reading p > code").filter({ hasText: "`literal`" })).toHaveText("`literal`")
  expect(await page.locator(".markdown-reading pre code").textContent()).toBe('def sample():\n    marker = "`keep`"\n    return marker\n')
  const quote = page.locator(".markdown-reading blockquote")
  await expect(quote).toHaveCSS("font-style", "normal")
  await expect(quote.locator("em")).toHaveCSS("font-style", "italic")
  expect(await quote.locator("p").evaluateAll((elements) => elements.every((element) =>
    getComputedStyle(element, "::before").content === "none" && getComputedStyle(element, "::after").content === "none"
  ))).toBe(true)
  await expect(quote).toContainText("“原文引号”")
  await expect(quote.getByRole("link", { name: "参考资料" })).toHaveAttribute("href", "https://example.test/reference")
}

async function assertNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const width of [375, 400, 1440]) {
  for (const theme of ["light", "dark"]) {
    for (const loggedIn of [false, true]) {
      test(`public reader ${width}px ${theme} ${loggedIn ? "owner" : "visitor"}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await openReader(page, theme, loggedIn)
        await assertRendering(page)
        const prefix = `local-${width}-${theme}-${loggedIn ? "owner" : "visitor"}`
        await page.locator("#正文中部").scrollIntoViewIfNeeded()
        await page.locator(".markdown-reading > p").filter({ hasText: "段落 9：" }).scrollIntoViewIfNeeded()
        await assertNoPageOverflow(page)
        const admin = page.getByRole("button", { name: "管理入口" })
        const trigger = page.getByRole("button", { name: "打开文章目录" })
        expect(await admin.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed")
        const adminBounds = (await admin.boundingBox())!
        expect(adminBounds.y).toBeGreaterThanOrEqual(0)
        expect(adminBounds.y + adminBounds.height).toBeLessThanOrEqual(56)
        if (width < 1024) {
          expect((await trigger.boundingBox())!.y).toBeGreaterThanOrEqual(56)
          expect((await trigger.boundingBox())!.y).toBeLessThan(100)
        } else {
          await expect(trigger).toBeHidden()
        }
        await page.screenshot({ path: path.resolve("backups/article-reading-qa/" + prefix + "-middle.png") })
        const short = page.locator(".markdown-table").first()
        expect(await short.locator(".markdown-table-viewport").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        const wide = page.locator(".markdown-table").last()
        await wide.scrollIntoViewIfNeeded()
        const viewport = wide.locator(".markdown-table-viewport")
        if (width < 1024) {
          await expect(wide.getByText("左右滑动查看完整表格", { exact: false })).toBeVisible()
          expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
          const widths = await wide.locator("td").evaluateAll((cells) => cells.slice(0, 2).map((cell) => cell.getBoundingClientRect().width))
          expect(widths[1]).toBeGreaterThan(200)
          expect(await wide.locator("td").evaluateAll((cells) => cells.every((cell) => {
            const bounds = cell.getBoundingClientRect()
            return Array.from(cell.querySelectorAll("code")).every((code) => {
              const codeBounds = code.getBoundingClientRect()
              return codeBounds.left >= bounds.left - 1 && codeBounds.right <= bounds.right + 1
            })
          }))).toBe(true)
          await expect(wide.locator("code").first()).toHaveCSS("white-space", "nowrap")
          await viewport.focus()
          await viewport.press("ArrowRight")
          await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        }
        await assertNoPageOverflow(page)
        await page.screenshot({ path: path.resolve("backups/article-reading-qa/" + prefix + "-table.png") })
        if (width < 1024) {
          await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth })
          await page.screenshot({ path: path.resolve("backups/article-reading-qa/" + prefix + "-table-right.png") })
        }
        if (width < 1024) {
          await trigger.click()
          const dialog = page.getByRole("dialog", { name: "文章目录" })
          await dialog.getByRole("link", { name: "多段引用", exact: true }).click()
          await expect(dialog).toHaveCount(0)
          await expect(page.locator("#多段引用")).toBeFocused()
          await expect.poll(async () => (await page.locator("#多段引用").boundingBox())!.y).toBeGreaterThanOrEqual(100)
          await trigger.click()
          await page.keyboard.press("Escape")
          await expect(trigger).toBeFocused()
        }
        await admin.click()
        if (loggedIn) await expect(page.getByRole("heading", { name: "测试后台" })).toBeVisible()
        else await expect(page.getByRole("dialog")).toBeVisible()
      })
    }
  }
}

for (const kind of ["idea", "preview"]) {
  for (const theme of ["light", "dark"]) {
    test(`${kind} reuses reading fixes in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 })
      await openReader(page, theme, true, kind)
      await assertRendering(page)
      await page.locator(".markdown-table").last().scrollIntoViewIfNeeded()
      await assertNoPageOverflow(page)
      await expect(page.locator(".markdown-table").last().getByRole("region")).toBeVisible()
      await page.screenshot({ path: path.resolve(`backups/article-reading-qa/local-${kind}-${theme}-table.png`) })
    })
  }
}
