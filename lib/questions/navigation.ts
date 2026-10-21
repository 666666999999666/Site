export interface QuestionNavigation {
  tab: "today" | "library"
  query: string
  status: string
  rating: string
  page: number
}

export const EMPTY_QUESTION_NAVIGATION: QuestionNavigation = {
  tab: "today", query: "", status: "", rating: "", page: 1,
}
const listPath = "/admin/questions"
const statuses = new Set(["READY", "DUE", "FUTURE", "NEW", "PENDING", "DISABLED"])
const ratings = new Set(["NONE", "AGAIN", "HARD", "GOOD", "EASY"])

/** Navigation parameters are UI state; only the finite API filters are forwarded. */
export function readQuestionNavigation(params: Pick<URLSearchParams, "get">): QuestionNavigation {
  const status = params.get("status")?.trim().toUpperCase() ?? ""
  const rating = params.get("rating")?.trim().toUpperCase() ?? ""
  const rawPage = params.get("page")?.trim() ?? "1"
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1
  return {
    tab: params.get("tab") === "library" ? "library" : "today",
    query: Array.from(params.get("q")?.trim() ?? "").slice(0, 200).join(""),
    status: statuses.has(status) ? status : "",
    rating: ratings.has(rating) ? rating : "",
    page: Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
  }
}

export function questionPageURL(state: QuestionNavigation): string {
  const normalized = readQuestionNavigation(new URLSearchParams({
    tab: state.tab, q: state.query, status: state.status, rating: state.rating, page: String(state.page),
  }))
  const params = new URLSearchParams()
  if (normalized.tab === "library") params.set("tab", "library")
  if (normalized.query) params.set("q", normalized.query)
  if (normalized.status) params.set("status", normalized.status)
  if (normalized.rating) params.set("rating", normalized.rating)
  if (normalized.page > 1) params.set("page", String(normalized.page))
  return listPath + (params.size ? "?" + params.toString() : "")
}

/** An edit page can return only to this feature's list, never another origin. */
export function questionReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) return listPath
  try {
    const url = new URL(value, "https://question-navigation.invalid")
    if (url.origin !== "https://question-navigation.invalid" || url.pathname !== listPath) return listPath
    const anchor = /^#question-[A-Za-z0-9_-]{1,128}$/.test(url.hash) ? url.hash : ""
    return questionPageURL(readQuestionNavigation(url.searchParams)) + anchor
  } catch { return listPath }
}

export function questionEditorURL(id: string, returnTo: string): string {
  return `${listPath}/${encodeURIComponent(id)}?${new URLSearchParams({ returnTo: questionReturnTo(returnTo) })}`
}

export function questionNewURL(returnTo: string): string {
  return `${listPath}/new?${new URLSearchParams({ returnTo: questionReturnTo(returnTo) })}`
}
