import type { Post } from "@/lib/generated/prisma/client"
import { normalizeTags } from "@/lib/tags"

type PostDraftSource = Pick<Post,
  "title" | "content" | "excerpt" | "contentFormat" | "readHint" | "categoryId" |
  "seriesId" | "seriesOrder" | "tags" | "publishedAt"
>

export type PostDraft = {
  title: string
  content: string
  excerpt: string
  contentFormat: string
  readHint: string
  categoryId: string
  seriesId: string
  seriesOrder: string
  tags: string
  publishedAt: string
}

function toLocalDatetimeInput(date: string | Date): string {
  const value = new Date(date)
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function draftFromPost(post?: PostDraftSource): PostDraft {
  return {
    title: post?.title ?? "",
    content: post?.content ?? "",
    excerpt: post?.excerpt ?? "",
    contentFormat: post?.contentFormat ?? "",
    readHint: post?.readHint ?? "",
    categoryId: post?.categoryId ?? "",
    seriesId: post?.seriesId ?? "",
    seriesOrder: post?.seriesOrder == null ? "" : String(post.seriesOrder),
    tags: (post?.tags ?? []).join(", "),
    publishedAt: post?.publishedAt ? toLocalDatetimeInput(post.publishedAt) : "",
  }
}

/** Convert the author-facing draft to create fields or a metadata-safe update.
 * Keep this after uploads/publication review in the caller: it validates dates.
 */
export function postMutationInput(
  current: PostDraft,
  baseline: PostDraft,
  existing: boolean,
  status: "DRAFT" | "PUBLISHED",
  publicationReviewToken?: string,
) {
  let publishIso: string | null = null
  if (current.publishedAt) {
    const date = new Date(current.publishedAt)
    if (Number.isNaN(date.getTime())) throw new Error("发布时间无效")
    publishIso = date.toISOString()
  }
  const fields = {
    title: current.title,
    // 未改正文时不发送 content，避免保存 metadata 顺带规范化旧格式。
    ...(!existing || current.content !== baseline.content ? { content: current.content } : {}),
    excerpt: current.excerpt,
    contentFormat: current.contentFormat || null,
    readHint: current.readHint || null,
    categoryId: current.categoryId || null,
    seriesId: current.seriesId || null,
    seriesOrder: current.seriesId ? (current.seriesOrder.trim() ? Number(current.seriesOrder) : null) : null,
    tags: normalizeTags([current.tags]),
    publishedAt: publishIso,
  }
  const body = existing ? {
    status,
    ...(publicationReviewToken ? { publicationReviewToken } : {}),
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => (
      current[key as keyof PostDraft] !== baseline[key as keyof PostDraft] ||
      key === "seriesOrder" && current.seriesId !== baseline.seriesId
    ))),
  } : { ...fields, status, ...(publicationReviewToken ? { publicationReviewToken } : {}) }
  return body
}
