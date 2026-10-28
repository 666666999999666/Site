import { isMaterialStatus, type MaterialStatus } from "./material-status"

export interface IdeaListFilters {
  q: string
  tag: string
  projectId: string
  discussionStatus?: MaterialStatus
}

export const EMPTY_IDEA_LIST_FILTERS: IdeaListFilters = { q: "", tag: "", projectId: "" }

/** Canonical list state is shared by server data, links and browser history. */
export function readIdeaListFilters(params: Pick<URLSearchParams, "get">): IdeaListFilters {
  const read = (key: string, maxLength: number) => {
    const value = params.get(key)?.trim() ?? ""
    return [...value].length <= maxLength ? value : ""
  }
  const discussionStatus = params.get("discussionStatus")
  return { q: read("q", 200), tag: read("tag", 50), projectId: read("projectId", 100), ...(isMaterialStatus(discussionStatus) ? { discussionStatus } : {}) }
}

export function ideaListHref(filters: IdeaListFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(readIdeaListFilters(new URLSearchParams({ ...filters })))) {
    if (value) params.set(key, value)
  }
  return "/admin/ideas" + (params.size ? "?" + params.toString() : "")
}

/** returnTo may only select filters on this private list, never another route. */
export function safeIdeaReturnHref(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/admin/ideas"
  try {
    const url = new URL(value, "https://idea-list.invalid")
    if (url.origin !== "https://idea-list.invalid" || url.pathname !== "/admin/ideas") return "/admin/ideas"
    return ideaListHref(readIdeaListFilters(url.searchParams))
  } catch { return "/admin/ideas" }
}

export function ideaDocumentHref(id: string, returnTo: string, edit = false): string {
  const params = new URLSearchParams()
  if (edit) params.set("edit", "1")
  const list = safeIdeaReturnHref(returnTo)
  if (list !== "/admin/ideas") params.set("returnTo", list)
  return "/admin/ideas/" + encodeURIComponent(id) + (params.size ? "?" + params.toString() : "")
}

export function ideaListPositionKey(ownerId: string, href: string): string {
  return "qz-idea-list-position:" + encodeURIComponent(ownerId) + ":" + safeIdeaReturnHref(href)
}

export function readIdeaListPosition(value: string | null): number {
  const position = Number(value)
  return Number.isFinite(position) && position >= 0 && position <= 10_000_000 ? position : 0
}
