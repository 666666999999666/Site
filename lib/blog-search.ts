export interface HighlightPart {
  text: string
  match: boolean
}

/** Literal, case-insensitive matching; the result must be rendered as React text. */
export function highlightSearchText(text: string, query: string): HighlightPart[] {
  const needle = query.trim()
  if (!needle) return [{ text, match: false }]
  const expression = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu")
  const parts: HighlightPart[] = []
  let offset = 0
  for (const match of text.matchAll(expression)) {
    const index = match.index
    if (index > offset) parts.push({ text: text.slice(offset, index), match: false })
    parts.push({ text: match[0], match: true })
    offset = index + match[0].length
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false })
  return parts.length ? parts : [{ text, match: false }]
}

export function searchContext(text: string, query: string, maxLength = 180): string | null {
  const plain = text.replace(/\s+/g, " ").trim()
  const needle = query.trim()
  if (!needle) return null
  const index = plain.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase())
  if (index < 0) return null
  const length = Math.max(1, maxLength)
  const start = Math.max(0, index - Math.floor(length / 3))
  const end = Math.min(plain.length, start + length)
  return `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`
}

export function updateBlogFilters(query: string, key: "search" | "category", value: string): string {
  const params = new URLSearchParams(query)
  if (value) params.set(key, value)
  else params.delete(key)
  return params.toString()
}

export function resetBlogFilters(query: string): string {
  const params = new URLSearchParams(query)
  params.delete("search")
  params.delete("category")
  return params.toString()
}

/** PostgreSQL LIKE (used by Prisma contains) must not interpret user text as wildcards. */
export function literalContainsSearch(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&")
}
