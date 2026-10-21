type NoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function noticeKey(postId: string, ownerId?: string) {
  return `qz-post-image-notice:${ownerId ?? "local"}:${postId}`
}

function warningList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((warning): warning is string => (
    typeof warning === "string" && warning.trim().length > 0 && warning.length <= 1000
  )))].slice(0, 20)
}

/** Carry non-blocking upload notices across the new-post route replacement. */
export function rememberPostImageWarnings(postId: string, warnings: readonly string[], ownerId?: string, storage?: NoticeStorage): boolean {
  try {
    const target = storage ?? window.sessionStorage
    const key = noticeKey(postId, ownerId)
    const notices = warningList(warnings)
    if (notices.length) target.setItem(key, JSON.stringify(notices))
    else target.removeItem(key)
    return true
  } catch { return false }
}

/** Each saved post/owner consumes its notice once; unrelated posts never see it. */
export function consumePostImageWarnings(postId: string, ownerId?: string, storage?: NoticeStorage): string[] {
  try {
    const target = storage ?? window.sessionStorage
    const key = noticeKey(postId, ownerId)
    const raw = target.getItem(key)
    target.removeItem(key)
    return raw ? warningList(JSON.parse(raw)) : []
  } catch { return [] }
}
