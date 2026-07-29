export type PostStatusValue = "DRAFT" | "PUBLISHED"

export interface ExistingPublishState {
  status: PostStatusValue
  publishedAt: Date | null
}

export function resolvePublishedAt({
  existing,
  nextStatus,
  requestedPublishedAt,
  now = new Date(),
}: {
  existing?: ExistingPublishState
  nextStatus: PostStatusValue
  requestedPublishedAt?: Date | null
  now?: Date
}): Date | null {
  if (nextStatus === "DRAFT") return null
  if (requestedPublishedAt instanceof Date) return requestedPublishedAt
  if (existing?.status === "PUBLISHED" && existing.publishedAt) return existing.publishedAt
  return now
}
