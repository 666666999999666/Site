import { expect, test } from "@playwright/test"

for (const width of [390, 1440]) {
  test(`search combines filters, resets, and restores history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/blog-discovery?category=engineering&search=harness")
    const input = page.getByRole("searchbox")
    await expect(page.getByRole("status")).toHaveText("找到 2 篇文章")
    await expect(page.getByText("正文匹配", { exact: true })).toHaveCount(2)
    await expect(page.getByRole("button", { name: "工程", exact: true })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "清除搜索", exact: true }).last().click()
    await expect(input).toHaveValue("")
    await expect(page).toHaveURL(/category=engineering$/)
    await expect(page.getByText("独立摘要一")).toBeVisible()
    await input.fill("不存在关键词")
    await expect(page.getByRole("status")).toHaveText("找到 0 篇文章")
    await expect(page.getByText("当前搜索或分类条件下没有匹配文章。")).toBeVisible()
    await expect(input).toHaveValue("不存在关键词")
    await page.getByRole("button", { name: "重置全部筛选" }).click()
    await expect(input).toHaveValue("")
    await expect(page).toHaveURL(/\/blog-discovery$/)
    await expect(page.getByRole("status")).toHaveText("找到 3 篇文章")
    await page.goto("/blog-discovery?category=notes&search=中文")
    await expect(input).toHaveValue("中文")
    await page.goBack()
    await expect(input).toHaveValue("")
    await expect(page.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true")
    await page.goForward()
    await expect(input).toHaveValue("中文")
    await expect(page.getByRole("button", { name: "笔记", exact: true })).toHaveAttribute("aria-pressed", "true")
  })
}

test("IME composition and quick category changes preserve the complete search", async ({ page }) => {
  await page.goto("/blog-discovery")
  const input = page.getByRole("searchbox")
  await input.dispatchEvent("compositionstart")
  await input.fill("中文")
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/\/blog-discovery$/)
  await input.dispatchEvent("compositionend")
  await expect(page).toHaveURL(/search=/)
  await expect(page.getByRole("status")).toHaveText("找到 2 篇文章")
  await input.fill("harness+skill")
  await page.getByRole("button", { name: "工程", exact: true }).click()
  await expect(input).toHaveValue("harness+skill")
  // Both the intermediate Chinese/category filter and the final filter have one result.
  // Wait for the final navigation rather than mistaking that shared count for completion.
  await expect(page).toHaveURL((url) => url.searchParams.get("search") === "harness+skill" && url.searchParams.get("category") === "engineering")
  await expect(page.getByRole("status")).toHaveText("找到 1 篇文章")
  await expect(page.locator("mark").filter({ hasText: "harness+skill" })).toBeVisible()
  const url = new URL(page.url())
  expect(url.searchParams.get("search")).toBe("harness+skill")
  expect(url.searchParams.get("category")).toBe("engineering")
})

test("HTML and RSC payload contain only bounded cards and escaped matched text", async ({ page }) => {
  const response = await page.goto("/blog-discovery?search=harness")
  const html = await response!.text()
  expect(html).not.toContain("body-start-not-for-browser")
  expect(html).not.toContain("很长的非命中正文。".repeat(30))
  const search = page.getByRole("searchbox")
  await search.fill("<script>")
  await expect(page.getByRole("status")).toHaveText("找到 1 篇文章")
  await expect(page.locator("mark")).toContainText(["<script>"])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

for (const width of [390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`homepage keeps raw excerpts and numeric minutes at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      const response = await page.goto("/home-posts")
      const html = await response!.text()
      for (const marker of ["home-body-private-marker", "draft-private-marker", "inbox-private-marker", "category-internal-marker", "series-description-private-marker"]) {
        expect(html).not.toContain(marker)
      }
      await page.evaluate((mode) => {
        document.documentElement.classList.toggle("dark", mode === "dark")
        document.documentElement.style.colorScheme = mode
      }, theme)
      const cards = page.locator("article")
      await expect(cards).toHaveCount(3)
      await expect(cards.first().getByRole("heading")).toHaveText("首页原始摘要 <script>")
      await expect(cards.first().locator("p")).toContainText("**保留原始 Markdown**")
      await expect(cards.first().locator("p")).toContainText("<script>摘要原文</script>")
      await expect(cards.first().locator("p")).toHaveCSS("-webkit-line-clamp", "2")
      await expect(cards.first()).toContainText("系列 · 工程")
      await expect(cards.first()).toContainText("9分钟阅读")
      await expect(cards.first().locator("time")).toHaveText("2026年10月2日")
      await expect(cards.nth(1).locator("p")).toHaveCount(0)
      await expect(cards.nth(2)).toContainText("0分钟阅读")
      await expect(page.getByText("这条阅读提示不用于首页")).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const screenshot = testInfo.outputPath(`homepage-${width}-${theme}.png`)
      await page.screenshot({ path: screenshot, fullPage: true })
      await testInfo.attach(`homepage-${width}-${theme}`, { path: screenshot, contentType: "image/png" })
    })
  }
}

test("homepage RSC response omits full records and keeps the empty state", async ({ page }) => {
  const response = await page.request.get("/home-posts?_rsc=home-contract", { headers: { RSC: "1" } })
  expect(response.ok()).toBe(true)
  expect(response.headers()["content-type"]).toContain("text/x-component")
  const payload = await response.text()
  for (const marker of ["home-body-private-marker", "draft-private-marker", "inbox-private-marker", "category-internal-marker", "series-description-private-marker", "很长的首页文章正文。".repeat(30)]) {
    expect(payload).not.toContain(marker)
  }
  expect(payload).toContain("首页原始摘要")
  await page.goto("/home-posts?empty=1")
  await expect(page.getByText("还没有文章，开始写下第一篇吧。")).toBeVisible()
  await expect(page.locator("article")).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "最新文章" })).toHaveCount(0)
})
