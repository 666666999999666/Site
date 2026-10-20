import type { Ctx } from "@milkdown/kit/ctx"
import { imageBlockSchema, imageBlockView } from "@milkdown/kit/component/image-block"
import { closeHistory } from "@milkdown/kit/prose/history"
import type { NodeViewConstructor } from "@milkdown/kit/prose/view"
import { $view } from "@milkdown/kit/utils"
import { normalizeImageWidth } from "@/lib/image-presentation"
import { imageBlockPresentationSchema } from "@/lib/editor-image-schema"

/** Crepe's default image schema stores its resize ratio in alt, losing author text. */
export function configureImagePresentation(ctx: Ctx) {
  ctx.update(imageBlockSchema.key, (previous) => (context) => (
    imageBlockPresentationSchema(previous(context))
  ))
}

const imageView: NodeViewConstructor = (initial, view, getPos, decorations, innerDecorations) => {
  // Keep Crepe's existing URL/upload interface for newly inserted empty image blocks.
  if (!initial.attrs.src) {
    const emptyView = imageBlockView.view(initial, view, getPos, decorations, innerDecorations)
    return {
      ...emptyView,
      update(node, nextDecorations, nextInnerDecorations) {
        if (node.attrs.src) return false
        return emptyView.update?.(node, nextDecorations, nextInnerDecorations) ?? false
      },
    }
  }

  let node = initial
  let dragging = false
  let pendingWidth: number | undefined
  const dom = document.createElement("div")
  dom.className = "milkdown-image-block editor-image-block"
  dom.contentEditable = "false"
  const wrapper = document.createElement("div")
  wrapper.className = "image-wrapper"
  Object.assign(wrapper.style, { maxWidth: "100%", minWidth: "0", display: "block" })
  const image = document.createElement("img")
  image.dataset.type = "image-block"
  image.draggable = false
  Object.assign(image.style, { maxWidth: "100%", height: "auto", minHeight: "0", objectFit: "contain" })
  wrapper.append(image)

  const resize = document.createElement("button")
  resize.type = "button"
  resize.className = "absolute bottom-0 right-0 z-10 h-6 w-6 rounded border border-border bg-background text-foreground"
  resize.textContent = "↔"
  resize.setAttribute("aria-label", "拖动调整图片宽度")
  resize.title = "拖动调整图片宽度；也可在图片设置中输入像素值"
  Object.assign(resize.style, { touchAction: "none", cursor: "ew-resize" })
  wrapper.append(resize)

  const caption = document.createElement("p")
  caption.className = "my-2 text-center text-sm text-muted-foreground"

  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.className = "my-2 rounded border border-border px-3 py-1 text-sm"
  toggle.textContent = "图片设置"
  toggle.setAttribute("aria-expanded", "false")
  const panel = document.createElement("div")
  panel.className = "mb-3 rounded border border-border bg-muted p-3 text-sm"
  panel.hidden = true
  const makeInput = (text: string, type = "text") => {
    const label = document.createElement("label")
    label.className = "mb-2 block"
    label.append(document.createTextNode(text))
    const input = document.createElement("input")
    input.type = type
    input.className = "ml-2 max-w-full rounded border border-input bg-background px-2 py-1"
    input.setAttribute("aria-label", text)
    label.append(input)
    panel.append(label)
    return input
  }
  const widthInput = makeInput("显示宽度（像素）", "number")
  widthInput.min = "1"
  widthInput.max = "10000"
  widthInput.step = "1"
  widthInput.placeholder = "自动，最大为正文宽度"
  const altInput = makeInput("替代文本")
  const captionInput = makeInput("图片说明")
  const error = document.createElement("p")
  error.setAttribute("role", "alert")
  panel.append(error)
  const apply = document.createElement("button")
  apply.type = "button"
  apply.className = "mr-2 rounded border border-border px-3 py-1"
  apply.textContent = "应用图片设置"
  const cancel = document.createElement("button")
  cancel.type = "button"
  cancel.className = "rounded border border-border px-3 py-1"
  cancel.textContent = "取消图片设置"
  panel.append(apply, cancel)
  dom.append(wrapper, caption, toggle, panel)

  function displayWidth(width: number | undefined) {
    wrapper.style.width = width ? `${width}px` : "fit-content"
    image.style.width = width ? "100%" : "auto"
    if (width) image.setAttribute("width", String(width))
    else image.removeAttribute("width")
  }

  function render() {
    if (image.getAttribute("src") !== node.attrs.src) image.src = node.attrs.src
    image.alt = node.attrs.alt
    image.title = node.attrs.caption
    caption.textContent = node.attrs.caption
    caption.hidden = !node.attrs.caption
    displayWidth(normalizeImageWidth(node.attrs.width))
    resize.disabled = toggle.disabled = !view.editable
  }

  function commit(attrs: Record<string, unknown>) {
    const position = getPos()
    if (position === undefined || !view.editable) return
    // One explicit apply or completed drag is one undo step. DOM sizing never writes metadata.
    view.dispatch(closeHistory(view.state.tr).setNodeMarkup(position, undefined, { ...node.attrs, ...attrs }))
    view.dispatch(closeHistory(view.state.tr))
  }

  function closePanel() {
    panel.hidden = true
    toggle.setAttribute("aria-expanded", "false")
    error.textContent = ""
    toggle.focus()
  }

  toggle.addEventListener("click", () => {
    if (!panel.hidden) return closePanel()
    widthInput.value = String(normalizeImageWidth(node.attrs.width) ?? "")
    altInput.value = node.attrs.alt
    captionInput.value = node.attrs.caption
    panel.hidden = false
    toggle.setAttribute("aria-expanded", "true")
    widthInput.focus()
  })
  apply.addEventListener("click", () => {
    const width = normalizeImageWidth(widthInput.value)
    if (widthInput.value && width === undefined) {
      error.textContent = "请输入 1–10000 之间的整数像素，或留空使用自动宽度。"
      widthInput.focus()
      return
    }
    commit({ width: width ?? null, alt: altInput.value, caption: captionInput.value })
    closePanel()
  })
  cancel.addEventListener("click", closePanel)
  panel.addEventListener("keydown", (event) => {
    // Enter/Escape may be selecting or dismissing a Chinese IME candidate.
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === "Escape") { event.preventDefault(); closePanel() }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      apply.click()
    }
  })

  let startX = 0
  let startWidth = 0
  function move(event: PointerEvent) {
    if (!dragging) return
    event.preventDefault()
    pendingWidth = Math.min(10_000, Math.max(1, Math.round(startWidth + event.clientX - startX)))
    displayWidth(pendingWidth)
  }
  function stop(commitChange: boolean) {
    if (!dragging) return
    dragging = false
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", finish)
    window.removeEventListener("pointercancel", abandon)
    window.removeEventListener("keydown", escape)
    if (commitChange && pendingWidth !== undefined) commit({ width: pendingWidth })
    pendingWidth = undefined
    render()
  }
  function finish() { stop(true) }
  function abandon() { stop(false) }
  function escape(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); stop(false) }
  }
  resize.addEventListener("pointerdown", (event) => {
    if (!view.editable || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragging = true
    startX = event.clientX
    startWidth = image.getBoundingClientRect().width
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", abandon)
    window.addEventListener("keydown", escape)
  })

  render()
  return {
    dom,
    update(updated) {
      if (updated.type !== initial.type || !updated.attrs.src) return false
      node = updated
      // Undo, redo and replacement values must update dimensions as well as the text.
      if (dragging) stop(false)
      render()
      return true
    },
    stopEvent: (event) => event.target instanceof Element && Boolean(event.target.closest("button, input, label")),
    ignoreMutation: () => true,
    selectNode: () => dom.classList.add("selected"),
    deselectNode: () => dom.classList.remove("selected"),
    destroy: () => stop(false),
  }
}

// Registered after Crepe's view; all other Crepe block/inline views remain intact.
export const imagePresentationView = $view(imageBlockSchema.node, () => imageView)
