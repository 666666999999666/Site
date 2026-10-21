import { ValidationError } from "./errors"

// Keep the ordered selection separate from article content and public settings.
export const FEATURED_POSTS_SETTING_KEY = "home_featured_post_ids"
export const MAX_FEATURED_POSTS = 3

export interface FeaturedPostOption {
  id: string
  title: string
  status: "DRAFT" | "PUBLISHED" | "MISSING"
}

export interface FeaturedPostsAdminState {
  selected: FeaturedPostOption[]
  candidates: FeaturedPostOption[]
}

export interface FeaturedPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
}

export function validateFeaturedPostIds(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("请求体必须是 JSON 对象")
  }
  const value = input as Record<string, unknown>
  const unknownKeys = Object.keys(value).filter((key) => key !== "ids")
  if (unknownKeys.length) throw new ValidationError(`不支持的字段：${unknownKeys.join(", ")}`)
  if (!Array.isArray(value.ids) || value.ids.length > MAX_FEATURED_POSTS) {
    throw new ValidationError(`请选择最多 ${MAX_FEATURED_POSTS} 篇文章`)
  }
  if (!value.ids.every((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id))) {
    throw new ValidationError("精选文章 ID 无效")
  }
  if (new Set(value.ids).size !== value.ids.length) throw new ValidationError("不能重复选择同一篇文章")
  return [...value.ids]
}

export function parseFeaturedPostIds(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    return validateFeaturedPostIds({ ids: JSON.parse(value) })
  } catch {
    // An invalid or old setting must not expose unrelated recent articles.
    return []
  }
}

export function validateFeaturedPostSearch(value: string | null): string {
  const query = value?.trim() ?? ""
  if (query.length > 200) throw new ValidationError("搜索关键词过长")
  return query
}

export function assertPublishedFeaturedPosts(ids: readonly string[], posts: readonly FeaturedPostOption[]) {
  const published = new Set(posts.filter((post) => post.status === "PUBLISHED").map((post) => post.id))
  if (ids.some((id) => !published.has(id))) {
    throw new ValidationError("只能精选仍存在的已发布文章，请移除已撤回或已删除的文章")
  }
}

export function orderPublishedFeaturedPosts<T extends { id: string; status: string }>(ids: readonly string[], posts: readonly T[]): T[] {
  const published = new Map(posts.filter((post) => post.status === "PUBLISHED").map((post) => [post.id, post]))
  return ids.flatMap((id) => {
    const post = published.get(id)
    return post ? [post] : []
  })
}
