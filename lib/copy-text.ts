/** Copy exactly the supplied text, reporting success only after a successful write. */
export async function copyText(source: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(source)
      return true
    }
  } catch {
    // A denied or unavailable async clipboard can still support a user-initiated copy.
  }

  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = window.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => (
    selection.getRangeAt(index).cloneRange()
  )) : []
  const field = document.createElement("textarea")
  field.value = source
  field.readOnly = true
  field.tabIndex = -1
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px;"
  const setExactText = (event: ClipboardEvent) => {
    if (event.clipboardData) {
      event.clipboardData.setData("text/plain", source)
      event.preventDefault()
    }
  }

  try {
    document.body.append(field)
    field.focus({ preventScroll: true })
    field.select()
    document.addEventListener("copy", setExactText)
    return document.execCommand("copy") === true
  } catch {
    return false
  } finally {
    document.removeEventListener("copy", setExactText)
    field.remove()
    if (focused?.isConnected) focused.focus({ preventScroll: true })
    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) {
        if (range.commonAncestorContainer.isConnected) selection.addRange(range)
      }
    }
  }
}
