import type { Series } from "@/lib/generated/prisma/client"

export type SeriesMutationInput = {
  title: string
  slug?: string
  description: string
  coverImage?: string | null
  sortOrder?: number
}

export type SeriesDraft = {
  title: string
  slug: string
  description: string
  coverImage: string
  sortOrder: string
}

export function seriesDraft(item?: Series): SeriesDraft {
  return {
    title: item?.title ?? "",
    slug: item?.slug ?? "",
    description: item?.description ?? "",
    coverImage: item?.coverImage ?? "",
    sortOrder: String(item?.sortOrder ?? 0),
  }
}

export function seriesMutationInput(draft: SeriesDraft, mode: "create" | "edit"): SeriesMutationInput {
  const title = draft.title.trim()
  const slug = draft.slug.trim()
  const description = draft.description.trim()
  if (!title || !description || (mode === "edit" && !slug)) {
    throw new Error(mode === "create"
      ? "系列标题和简介均为必填项"
      : "系列标题、slug 和简介均为必填项")
  }
  const sortOrder = Number(draft.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < -10_000 || sortOrder > 10_000) {
    throw new Error("系列排序必须是 -10000 到 10000 之间的整数")
  }
  return {
    title,
    ...(slug ? { slug } : {}),
    description,
    coverImage: draft.coverImage.trim() || null,
    sortOrder,
  }
}
