import { expect, test, type Locator, type Page } from "@playwright/test"

async function openImages(page: Page) {
  await page.goto("/image-workflow")
  await expect(page.locator(".editor-image-block")).toHaveCount(2)
}

async function setWidth(block: Locator, width: string) {
  await block.getByRole("button", { name: "图片设置", exact: true }).click()
  await block.getByLabel("显示宽度（像素）").fill(width)
  await block.getByRole("button", { name: "应用图片设置" }).click()
}

async function imageSize(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
  }))
}

test("ordinary and long image widths and alt survive preview, save and reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openImages(page)
  for (const index of [0, 1]) {
    const block = page.locator(".editor-image-block").nth(index)
    await setWidth(block, "600")
    await expect(block.locator("img")).toHaveAttribute("width", "600")
    await expect.poll(async () => (await imageSize(block.locator("img"))).width).toBeCloseTo(600, 0)
  }
  await expect(page.locator(".editor-image-block img").first()).toHaveAttribute("alt", "普通图片的替代文本")
  await expect(page.locator(".editor-image-block img").last()).toHaveAttribute("alt", "长图的替代文本")
  await page.getByRole("button", { name: "保存正文", exact: true }).click()
  const saved = await page.getByTestId("saved-markdown").textContent()
  expect(saved).toContain('![普通图片的替代文本](/test-image-landscape.svg "普通图片说明 {qz-width=600}")')
  expect(saved).toContain('![长图的替代文本](/test-image-long.svg "长图说明 {qz-width=600}")')
  for (const reopen of [false, true]) {
    if (reopen) {
      await page.getByRole("button", { name: "重新打开", exact: true }).click()
      await expect(page.locator(".editor-image-block")).toHaveCount(2)
      await expect(page.locator(".editor-image-block img").first()).toHaveAttribute("width", "600")
    }
    await page.getByRole("button", { name: "预览正文", exact: true }).click()
    const images = page.getByRole("region", { name: "发布效果预览" }).locator("img")
    await expect(images.first()).toHaveAttribute("alt", "普通图片的替代文本")
    await expect(images.first()).toHaveAttribute("title", "普通图片说明")
    await expect.poll(async () => (await imageSize(images.first())).width).toBeCloseTo(600, 0)
    await expect.poll(async () => (await imageSize(images.last())).width).toBeCloseTo(600, 0)
    expect(await imageSize(images.first())).toEqual({ width: 600, height: 400, naturalWidth: 1200, naturalHeight: 800 })
    expect(await imageSize(images.last())).toEqual({ width: 600, height: 2400, naturalWidth: 1200, naturalHeight: 4800 })
    await page.getByRole("button", { name: "继续编辑", exact: true }).click()
  }
})

test("display width is contained on narrow screens without changing saved metadata", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openImages(page)
  for (const index of [0, 1]) await setWidth(page.locator(".editor-image-block").nth(index), "600")
  await page.getByRole("button", { name: "保存正文", exact: true }).click()
  const saved = await page.getByTestId("saved-markdown").textContent()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "重新打开", exact: true }).click()
  for (const selector of [".editor-image-block img", ".markdown-reading img"]) {
    if (selector.startsWith(".markdown")) await page.getByRole("button", { name: "预览正文", exact: true }).click()
    for (const image of await page.locator(selector).all()) {
      await expect(image).toHaveAttribute("width", "600")
      const size = await imageSize(image)
      expect(size.width).toBeLessThan(390)
      expect(size.width).toBeGreaterThan(250)
      expect(size.height / size.width).toBeCloseTo(size.naturalHeight / size.naturalWidth, 2)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  expect(await page.getByTestId("saved-markdown").textContent()).toBe(saved)
})

test("image settings cancel, drag cancel, undo and redo preserve the original text and width", async ({ page }) => {
  await openImages(page)
  const block = page.locator(".editor-image-block").first()
  const image = block.locator("img")
  await setWidth(block, "600")
  await page.getByRole("button", { name: "保存正文", exact: true }).click()
  await block.getByRole("button", { name: "图片设置", exact: true }).click()
  await block.getByLabel("显示宽度（像素）").fill("300")
  await block.getByLabel("替代文本").fill("未提交的替代文本")
  await block.getByRole("button", { name: "取消图片设置" }).focus()
  await page.keyboard.press("Enter")
  await expect(image).toHaveAttribute("width", "600")
  await expect(image).toHaveAttribute("alt", "普通图片的替代文本")
  await setWidth(block, "400")
  await expect(image).toHaveAttribute("width", "400")
  await page.locator(".ProseMirror").focus()
  await page.keyboard.press("ControlOrMeta+z")
  await expect(image).toHaveAttribute("width", "600")
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(image).toHaveAttribute("width", "400")
  await page.getByRole("button", { name: "取消正文修改", exact: true }).click()
  await expect(image).toHaveAttribute("width", "600")
  const handle = block.getByRole("button", { name: "拖动调整图片宽度" })
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 100, box.y + box.height / 2)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await expect(image).toHaveAttribute("width", "600")
  await expect(page.getByTestId("markdown-output")).toHaveText((await page.getByTestId("saved-markdown").textContent())!)
})

test("a newly inserted image keeps the existing link interface and gains width controls", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".ProseMirror")).toBeVisible()
  await page.locator(".ProseMirror > p").first().click()
  await page.getByRole("button", { name: "插入图片", exact: true }).click()
  const link = page.locator(".milkdown-image-block .link-input-area")
  await expect(link).toBeVisible()
  await link.fill("/test-image-landscape.svg")
  await link.press("Enter")
  const block = page.locator(".editor-image-block")
  await expect(block).toHaveCount(1)
  await setWidth(block, "600")
  await expect(block.locator("img")).toHaveAttribute("width", "600")
  await expect(block.locator("img")).toHaveAttribute("alt", "")
  await expect(page.getByTestId("markdown-output")).toContainText('![](/test-image-landscape.svg "{qz-width=600}")')
})

test("completed drags serialize pixels and pointer cancellation restores the last applied width", async ({ page }) => {
  await openImages(page)
  const block = page.locator(".editor-image-block").first()
  await setWidth(block, "600")
  const handle = block.getByRole("button", { name: "拖动调整图片宽度" })
  await handle.scrollIntoViewIfNeeded()
  let box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2)
  await page.mouse.up()
  await expect(block.locator("img")).toHaveAttribute("width", "400")
  await page.getByRole("button", { name: "保存正文", exact: true }).click()
  await expect(page.getByTestId("saved-markdown")).toContainText('普通图片说明 {qz-width=400}')
  await handle.scrollIntoViewIfNeeded()
  box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2)
  await handle.dispatchEvent("pointercancel")
  await page.mouse.up()
  await expect(block.locator("img")).toHaveAttribute("width", "400")
  await expect(page.getByTestId("markdown-output")).toHaveText((await page.getByTestId("saved-markdown").textContent())!)
})

test("confirming a Chinese IME candidate does not apply image settings", async ({ page }) => {
  await openImages(page)
  const block = page.locator(".editor-image-block").first()
  await block.getByRole("button", { name: "图片设置", exact: true }).click()
  const alt = block.getByLabel("替代文本")
  await alt.fill("中文替代文本")
  await alt.dispatchEvent("compositionstart", { data: "文" })
  await alt.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true })
  await alt.dispatchEvent("compositionend", { data: "文" })
  await expect(block.getByRole("button", { name: "应用图片设置" })).toBeVisible()
  await expect(block.locator("img")).toHaveAttribute("alt", "普通图片的替代文本")
  // Safari and older IME implementations can report keyCode 229 without isComposing.
  await alt.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229 })
  await expect(block.getByRole("button", { name: "应用图片设置" })).toBeVisible()
  await expect(block.locator("img")).toHaveAttribute("alt", "普通图片的替代文本")
  await alt.press("Enter")
  await expect(block.getByRole("button", { name: "应用图片设置" })).toBeHidden()
  await expect(block.locator("img")).toHaveAttribute("alt", "中文替代文本")
})

test("external replacement and cancelling edits work for an image-only document", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await openImages(page)
  await page.locator(".ProseMirror").press("ControlOrMeta+End")
  await page.getByRole("button", { name: "切换为单图文档" }).click()
  const block = page.locator(".editor-image-block")
  await expect(block).toHaveCount(1)
  await expect(block.locator("img")).toHaveAttribute("width", "600")
  const saved = await page.getByTestId("saved-markdown").textContent()
  // Cross the delayed listener: Crepe's own trailing paragraph is not an edit.
  await page.waitForTimeout(500)
  expect(await page.getByTestId("markdown-output").textContent()).toBe(saved)
  await setWidth(block, "400")
  await page.getByRole("button", { name: "取消正文修改", exact: true }).click()
  await expect(block.locator("img")).toHaveAttribute("width", "600")
  await expect(block.locator("img")).toHaveAttribute("alt", "唯一图片")
  await page.waitForTimeout(500)
  expect(await page.getByTestId("markdown-output").textContent()).toBe(saved)
  expect(errors).toEqual([])
})

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`image settings retain their layout and contrast against Crepe resets at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await openImages(page)
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark")
      const block = page.locator(".editor-image-block").first()
      await block.getByRole("button", { name: "图片设置", exact: true }).click()
      const panel = block.locator(".editor-image-settings")
      await expect(panel).toBeVisible()
      const panelBox = (await panel.boundingBox())!
      const panelStyles = await panel.evaluate((element) => {
        const style = getComputedStyle(element)
        return { padding: parseFloat(style.paddingTop), border: parseFloat(style.borderTopWidth) }
      })
      expect(panelStyles.padding).toBeGreaterThanOrEqual(12)
      expect(panelStyles.border).toBeGreaterThanOrEqual(1)

      for (const field of await panel.locator(".editor-image-field").all()) {
        const labelBox = (await field.locator("span").boundingBox())!
        const input = field.locator("input")
        const inputBox = (await input.boundingBox())!
        // The label owns a separate row, and the field fills the panel instead
        // of relying on a browser's narrow default inline input width.
        expect(inputBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height + 5)
        expect(inputBox.width).toBeGreaterThan(panelBox.width * 0.8)
        expect(inputBox.x).toBeGreaterThanOrEqual(panelBox.x + 10)
        expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width - 10)
        const inputStyles = await input.evaluate((element) => {
          const style = getComputedStyle(element)
          return { padding: parseFloat(style.paddingTop), border: parseFloat(style.borderTopWidth) }
        })
        expect(inputStyles.padding).toBeGreaterThanOrEqual(8)
        expect(inputStyles.border).toBeGreaterThanOrEqual(1)
      }

      const buttons = panel.getByRole("button")
      const buttonBoxes = []
      for (const button of await buttons.all()) {
        const box = (await button.boundingBox())!
        buttonBoxes.push(box)
        expect(box.height).toBeGreaterThanOrEqual(36)
        expect(box.x).toBeGreaterThanOrEqual(panelBox.x + 10)
        expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width - 10)
        await expect(button).toHaveCSS("padding-left", "12px")
        await expect(button).toHaveCSS("border-top-width", "1px")
      }
      const [applyBox, cancelBox] = buttonBoxes
      expect(cancelBox.y >= applyBox.y + applyBox.height + 7 || cancelBox.x >= applyBox.x + applyBox.width + 7).toBe(true)

      const contrasts = await panel.evaluate((element) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        const context = canvas.getContext("2d")!
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((channel) => {
            const value = channel / 255
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
          })
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
        }
        const ratio = (foreground: string, background: string) => {
          const first = luminance(foreground), second = luminance(background)
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
        }
        const panelStyle = getComputedStyle(element)
        const labels = ratio(panelStyle.color, panelStyle.backgroundColor)
        const controls = Array.from(element.querySelectorAll("input, button"), (control) => {
          const style = getComputedStyle(control)
          return ratio(style.color, style.backgroundColor)
        })
        return { labels, controls }
      })
      expect(contrasts.labels).toBeGreaterThanOrEqual(4.5)
      for (const contrast of contrasts.controls) expect(contrast).toBeGreaterThanOrEqual(4.5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const screenshot = testInfo.outputPath(`image-settings-${width}-${theme}.png`)
      await panel.screenshot({ path: screenshot })
      await testInfo.attach("image-settings", { path: screenshot, contentType: "image/png" })
      await panel.getByRole("button", { name: "取消图片设置", exact: true }).click()
      await expect(panel).toBeHidden()
    })
  }
}
