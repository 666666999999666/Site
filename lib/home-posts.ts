// Homepage excerpts intentionally remain raw; BlogCard's summary/read-hint policy is different.
export const homePostSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  publishedAt: true,
  createdAt: true,
  readTime: true,
  category: { select: { name: true } },
  series: { select: { title: true } },
} as const

interface HomePostSource {
  id: string
  slug: string
  title: string
  excerpt: string | null
  publishedAt: Date | null
  createdAt: Date
  readTime: number
  category: { name: string } | null
  series: { title: string } | null
}

export interface HomePostData {
  id: string
  slug: string
  title: string
  excerpt: string | null
  date: string
  readTime: number
  category: { name: string } | null
  series: { title: string } | null
}

export function toHomePost(post: HomePostSource): HomePostData {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    date: (post.publishedAt ?? post.createdAt).toISOString(),
    readTime: post.readTime,
    category: post.category ? { name: post.category.name } : null,
    series: post.series ? { title: post.series.title } : null,
  }
}
