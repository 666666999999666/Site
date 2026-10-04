"use client"

import { useLayoutEffect, useRef, useState } from "react"
import type { DocumentMode } from "./DocumentActionBar"
export function clearDocumentEditQuery() {
  const url = new URL(location.href)
  if (!url.searchParams.has("edit")) return
  url.searchParams.delete("edit")
  // Next 支持原生 History API；同步去掉 edit，立即刷新也不会再进入编辑态。
  window.history.replaceState(null, "", url.pathname + url.search + url.hash)
}

export function useDocumentPosition(initialMode: DocumentMode, focusEditor?: () => void) {
  const [mode, setMode] = useState(initialMode)
  const positions = useRef<Record<DocumentMode, number>>({ read: 0, edit: 0, preview: 0 })
  const changed = useRef(false)
  function switchMode(next: DocumentMode) {
    if (next === mode) return
    positions.current[mode] = window.scrollY
    changed.current = true
    setMode(next)
  }
  useLayoutEffect(() => {
    if (!changed.current) return
    const frame = requestAnimationFrame(() => {
      changed.current = false
      if (mode === "edit") focusEditor?.()
      window.scrollTo({ top: positions.current[mode], behavior: "instant" })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusEditor, mode])
  return { mode, switchMode }
}
