/** Locale-free hrefs for i18n/navigation.Link. Never accept an arbitrary return URL. */
export function publicBlogListHref(filters: { search?: string; category?: string } = {}): string {
  const params = new URLSearchParams()
  const search = filters.search?.trim() ?? ""
  if (search) params.set("search", search)
  if (filters.category) params.set("category", filters.category)
  return "/blog" + (params.size ? `?${params}` : "")
}

export function safePublicBlogReturnHref(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192 || !value.startsWith("/blog")) return "/blog"
  try {
    const url = new URL(value, "https://public-blog.invalid")
    if (url.origin !== "https://public-blog.invalid" || url.pathname !== "/blog") return "/blog"
    return publicBlogListHref({
      search: url.searchParams.get("search") ?? "",
      category: url.searchParams.get("category") ?? "",
    })
  } catch { return "/blog" }
}

export function publicBlogPostHref(slug: string, returnTo?: unknown): string {
  const path = `/blog/${encodeURIComponent(slug)}`
  const list = safePublicBlogReturnHref(returnTo)
  // Direct links, homepage cards and unfiltered lists keep their clean article URL.
  return list === "/blog" ? path : `${path}?${new URLSearchParams({ returnTo: list })}`
}
