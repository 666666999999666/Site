export type PostListStatus = "ALL" | "DRAFT" | "PUBLISHED"
export interface PostListFilters { q: string; categoryId: string; status?: PostListStatus }
export const EMPTY_POST_LIST_FILTERS: PostListFilters = { q: "", categoryId: "" }

export function readPostListFilters(params: Pick<URLSearchParams, "get">): PostListFilters {
  const read = (key: string, limit: number) => {
    const value = params.get(key)?.trim() ?? ""
    return [...value].length <= limit ? value : ""
  }
  const status = params.get("status")
  return {
    q: read("q", 200), categoryId: read("categoryId", 100),
    ...(status === "DRAFT" || status === "PUBLISHED" ? { status } : {}),
  }
}

export function postListHref(filters: PostListFilters): string {
  const params = new URLSearchParams()
  const input = new URLSearchParams({ q: filters.q, categoryId: filters.categoryId })
  if (filters.status) input.set("status", filters.status)
  for (const [key, value] of Object.entries(readPostListFilters(input))) {
    if (value) params.set(key, value)
  }
  return "/admin/posts" + (params.size ? "?" + params : "")
}

/** Only stale cached server state needs a mount-time replay of the URL. */
export function shouldRestorePostListOnMount(initialFilters: PostListFilters, params: Pick<URLSearchParams, "get">): boolean {
  return postListHref(initialFilters) !== postListHref(readPostListFilters(params))
}

export function safePostReturnHref(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/admin/posts"
  try {
    const url = new URL(value, "https://post-list.invalid")
    if (url.origin !== "https://post-list.invalid" || url.pathname !== "/admin/posts") return "/admin/posts"
    return postListHref(readPostListFilters(url.searchParams))
  } catch { return "/admin/posts" }
}

export function postDocumentHref(id: string, returnTo: string, edit = false): string {
  const params = new URLSearchParams()
  if (edit) params.set("edit", "1")
  const list = safePostReturnHref(returnTo)
  if (list !== "/admin/posts") params.set("returnTo", list)
  return "/admin/posts/" + encodeURIComponent(id) + (params.size ? "?" + params : "")
}

export function postListPositionKey(ownerId: string, href: string): string {
  return "qz-post-list-position:" + encodeURIComponent(ownerId) + ":" + safePostReturnHref(href)
}

export function readPostListPosition(value: string | null): number {
  const position = Number(value)
  return Number.isFinite(position) && position >= 0 && position <= 10_000_000 ? position : 0
}
