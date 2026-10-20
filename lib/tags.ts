/** Preserve commas inside code/type syntax or quoted labels; split list separators only. */
export function splitTagTokens(tag: string): string[] {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">", "（": "）", "【": "】", "“": "”", '"': '"', "`": "`" }
  const stack: string[] = []
  const tokens: string[] = []
  let start = 0
  for (let index = 0; index < tag.length; index += 1) {
    const character = tag[index]
    if (character === "\\") { index += 1; continue }
    const closing = stack.at(-1)
    if (closing === character) { stack.pop(); continue }
    if (closing === '"' || closing === "`" || closing === "”") continue
    if (pairs[character]) { stack.push(pairs[character]); continue }
    if (!stack.length && /[,，、]/u.test(character)) {
      tokens.push(tag.slice(start, index))
      start = index + 1
    }
  }
  // Unbalanced type/quote syntax is ambiguous. Leave the author's whole label intact.
  if (stack.length) return [tag]
  return [...tokens, tag.slice(start)]
}

/** Only unambiguous separators are normalized. Semantic aliases require author approval. */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.flatMap(splitTagTokens).map((tag) => tag.trim()).filter(Boolean))]
}

export function countPublicTags(posts: readonly { tags: readonly string[] }[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of normalizeTags(post.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
}

/** A legacy composite URL remains an aggregate of its explicitly separated tags. */
export function matchesTagRoute(tags: readonly string[], routeTag: string): boolean {
  const requested = new Set(normalizeTags([routeTag]))
  return normalizeTags(tags).some((tag) => requested.has(tag))
}

export function planTagNormalization<T extends { id: string; slug: string; tags: string[] }>(posts: readonly T[]) {
  return posts.flatMap((post) => {
    const normalized = normalizeTags(post.tags)
    if (JSON.stringify(post.tags) === JSON.stringify(normalized)) return []
    return [{
      id: post.id,
      slug: post.slug,
      before: post.tags,
      after: normalized,
      oldUrls: post.tags.map((tag) => `/zh/blog/tags/${encodeURIComponent(tag)}`),
      newUrls: normalized.map((tag) => `/zh/blog/tags/${encodeURIComponent(tag)}`),
      collapsedDuplicates: post.tags.flatMap(splitTagTokens).filter((tag) => tag.trim()).length - normalized.length,
      needsAuthorReview: normalized.length > 20 || normalized.some((tag) => tag.length > 50),
    }]
  })
}
