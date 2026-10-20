import { normalizeTags } from "./tags"

export interface RelatedPostSignals {
  id: string
  seriesId: string | null
  categoryId: string | null
  tags: string[]
  publishedAt: Date | null
  createdAt: Date
}

export function relatedPostReason(
  current: RelatedPostSignals,
  candidate: RelatedPostSignals
): "series" | "category" | "tags" | null {
  if (current.seriesId && candidate.seriesId === current.seriesId) return "series"
  if (current.categoryId && candidate.categoryId === current.categoryId) return "category"
  const tags = new Set(normalizeTags(current.tags))
  return normalizeTags(candidate.tags).some((tag) => tags.has(tag)) ? "tags" : null
}

export function relatedPostScore(current: RelatedPostSignals, candidate: RelatedPostSignals): number {
  const sameSeries = Boolean(current.seriesId && candidate.seriesId === current.seriesId)
  const sameCategory = Boolean(current.categoryId && candidate.categoryId === current.categoryId)
  const currentTags = new Set(normalizeTags(current.tags))
  const sharedTags = normalizeTags(candidate.tags).filter((tag) => currentTags.has(tag)).length
  return (sameSeries ? 10_000 : 0) + (sameCategory ? 1_000 : 0) + Math.min(sharedTags, 20) * 10
}

function compareRecent(left: RelatedPostSignals, right: RelatedPostSignals): number {
  const rightTime = (right.publishedAt ?? right.createdAt).getTime()
  const leftTime = (left.publishedAt ?? left.createdAt).getTime()
  return rightTime - leftTime || left.id.localeCompare(right.id)
}

function uniqueCandidates<T extends RelatedPostSignals>(current: RelatedPostSignals, candidates: T[]): T[] {
  const unique = new Map<string, T>()
  for (const candidate of candidates) {
    if (candidate.id !== current.id) unique.set(candidate.id, candidate)
  }
  return [...unique.values()]
}

export function rankRelatedPosts<T extends RelatedPostSignals>(
  current: RelatedPostSignals,
  candidates: T[],
  limit = 3
): T[] {
  return uniqueCandidates(current, candidates)
    .filter((candidate) => relatedPostScore(current, candidate) > 0)
    .sort((left, right) => relatedPostScore(current, right) - relatedPostScore(current, left) || compareRecent(left, right))
    .slice(0, Math.max(0, limit))
}

/** Unrelated recent posts never pad a section labelled as related. */
export function selectPostRecommendations<T extends RelatedPostSignals>(
  current: RelatedPostSignals,
  candidates: T[],
  limit = 3
): { kind: "related" | "latest"; posts: T[] } {
  const related = rankRelatedPosts(current, candidates, limit)
  if (related.length) return { kind: "related", posts: related }
  return { kind: "latest", posts: uniqueCandidates(current, candidates).sort(compareRecent).slice(0, Math.max(0, limit)) }
}
