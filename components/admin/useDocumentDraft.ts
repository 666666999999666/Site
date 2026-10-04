"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type DraftFields = Record<string, string | string[]>
export interface LocalDraft<T> { savedAt: number; data: T }
const LEAVE_EVENT = "qz-document-before-leave"

export function confirmDocumentNavigation() {
  return window.dispatchEvent(new Event(LEAVE_EVENT, { cancelable: true }))
}

function sameData<T extends DraftFields>(a: T, b: T) {
  return Object.keys(b).every((key) => {
    const left = a[key]
    const right = b[key]
    return Array.isArray(right)
      ? Array.isArray(left) && left.length === right.length && right.every((value, index) => left[index] === value)
      : left === right
  })
}

function isLocalDraft<T extends DraftFields>(value: unknown, baseline: T): value is LocalDraft<T> {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<LocalDraft<T>>
  if (typeof candidate.savedAt !== "number" || !candidate.data || typeof candidate.data !== "object") return false
  return Object.keys(baseline).every((key) => (
    Array.isArray(baseline[key])
      ? Array.isArray(candidate.data?.[key]) && (candidate.data[key] as unknown[]).every((item) => typeof item === "string")
      : typeof candidate.data?.[key] === "string"
  ))
}

export function useDocumentDraft<T extends DraftFields>({
  initialData, storageKey, legacyStorageKey, legacyDefaults, label,
}: {
  initialData: T
  storageKey: string
  legacyStorageKey?: string
  legacyDefaults?: Partial<T>
  label: string
}) {
  const [data, setData] = useState(initialData)
  const [baseline, setBaseline] = useState(initialData)
  const [recovery, setRecovery] = useState<LocalDraft<T> | null>(null)
  const [storageError, setStorageError] = useState("")
  const [ready, setReady] = useState(false)
  const dataRef = useRef(initialData)
  const baselineRef = useRef(initialData)
  const dirty = !sameData(data, baseline)

  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      if (legacyStorageKey) localStorage.removeItem(legacyStorageKey)
      setStorageError("")
    } catch {
      setStorageError("浏览器无法清除本地草稿，请检查浏览器存储设置。")
    }
  }, [legacyStorageKey, storageKey])

  const persist = useCallback((next: T) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), data: next }))
      setStorageError("")
      return true
    } catch {
      setStorageError("浏览器无法保存恢复草稿。当前输入仍在页面中，请先保存，避免关闭后丢失。")
      return false
    }
  }, [storageKey])

  // 在输入回调中同步保存，后退或立即关页不会遗漏防抖期间的输入。
  const update = useCallback((next: T) => {
    if (sameData(next, dataRef.current)) return
    dataRef.current = next
    setData(next)
    if (!sameData(next, baselineRef.current)) persist(next)
    else clearStorage()
  }, [clearStorage, persist])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      try {
        const primary = localStorage.getItem(storageKey)
        const raw = primary ||
          (legacyStorageKey ? localStorage.getItem(legacyStorageKey) : null)
        if (!raw) return
        let parsed: unknown = JSON.parse(raw)
        if (!primary && legacyDefaults && parsed && typeof parsed === "object" &&
          "data" in parsed && parsed.data && typeof parsed.data === "object") {
          parsed = { ...parsed, data: { ...legacyDefaults, ...parsed.data } }
        }
        if (!cancelled && isLocalDraft(parsed, baselineRef.current) && !sameData(parsed.data, baselineRef.current)) {
          setRecovery(parsed)
        }
      } catch {
        if (!cancelled) setStorageError("无法读取本地恢复草稿；服务器内容未受影响。")
      } finally {
        if (!cancelled) setReady(true)
      }
    })
    return () => { cancelled = true }
  }, [legacyDefaults, legacyStorageKey, storageKey])

  const confirmLeave = useCallback(() => {
    if (sameData(dataRef.current, baselineRef.current)) return true
    const retained = persist(dataRef.current)
    return window.confirm(retained
      ? "有未保存的" + label + "修改，确认离开？本地草稿会保留。"
      : "浏览器无法保存恢复草稿，离开会丢失当前输入。确认离开？")
  }, [label, persist])

  useEffect(() => {
    const flush = () => {
      if (!sameData(dataRef.current, baselineRef.current)) persist(dataRef.current)
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (sameData(dataRef.current, baselineRef.current)) return
      flush()
      event.preventDefault()
      event.returnValue = ""
    }
    const beforeLeave = (event: Event) => {
      if (!confirmLeave()) event.preventDefault()
    }
    const interceptLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest("a") : null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const destination = new URL(anchor.href, location.href)
      if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search) return
      if (!confirmLeave()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    window.addEventListener("pagehide", flush)
    window.addEventListener("popstate", flush)
    window.addEventListener(LEAVE_EVENT, beforeLeave)
    document.addEventListener("click", interceptLink, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("popstate", flush)
      window.removeEventListener(LEAVE_EVENT, beforeLeave)
      document.removeEventListener("click", interceptLink, true)
    }
  }, [confirmLeave, persist])

  function commit(next: T) {
    baselineRef.current = next
    dataRef.current = next
    setBaseline(next)
    setData(next)
    setRecovery(null)
    clearStorage()
  }

  function discard() {
    commit(baselineRef.current)
  }

  function restore() {
    if (!recovery) return
    update(recovery.data)
    setRecovery(null)
  }

  function discardRecovery() {
    clearStorage()
    setRecovery(null)
  }

  const current = useCallback(() => dataRef.current, [])
  return { data, baseline, dirty, ready, recovery, storageError, current, update, commit, discard, restore, discardRecovery, confirmLeave }
}
