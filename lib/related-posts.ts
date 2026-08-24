export interface RelatedPostSignals {
  id: string
  seriesId: string | null
  categoryId: string | null
  tags: string[]
  publishedAt: Date | null
  createdAt: Date
}

export function relatedPostScore(
  current: RelatedPostSignals,
  candidate: RelatedPostSignals
): number {
  const sameSeries = Boolean(current.seriesId && candidate.seriesId === current.seriesId)
  const sameCategory = Boolean(current.categoryId && candidate.categoryId === current.categoryId)
  const currentTags = new Set(current.tags)
  const sharedTags = new Set(candidate.tags.filter((tag) => currentTags.has(tag))).size

  // Validation caps tags at 20, so a lower tier can never overtake a higher one.
  return (sameSeries ? 10_000 : 0) + (sameCategory ? 1_000 : 0) + sharedTags * 10
}

export function rankRelatedPosts<T extends RelatedPostSignals>(
  current: RelatedPostSignals,
  candidates: T[],
  limit = 3
): T[] {
  const unique = new Map<string, T>()
  for (const candidate of candidates) {
    if (candidate.id !== current.id) unique.set(candidate.id, candidate)
  }

  return [...unique.values()]
    .sort((left, right) => {
      const scoreDifference = relatedPostScore(current, right) - relatedPostScore(current, left)
      if (scoreDifference !== 0) return scoreDifference
      const rightTime = (right.publishedAt ?? right.createdAt).getTime()
      const leftTime = (left.publishedAt ?? left.createdAt).getTime()
      return rightTime - leftTime || left.id.localeCompare(right.id)
    })
    .slice(0, Math.max(0, limit))
}
