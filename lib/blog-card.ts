import { extractPlainText } from "./content"
import { searchContext } from "./blog-search"
import { getPostPresentation } from "./publication-content"

// Server-side input only: content is used for summaries/search context, never sent to BlogCard.
export const blogCardSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  content: true,
  publishedAt: true,
  createdAt: true,
  readTime: true,
  contentFormat: true,
  readHint: true,
  category: { select: { name: true } },
  series: { select: { title: true } },
} as const

interface CardSource {
  id: string
  slug: string
  title: string
  excerpt: string | null
  content?: string
  publishedAt: Date | null
  createdAt: Date
  readTime: number
  contentFormat?: string | null
  readHint?: string | null
  category: { name: string } | null
  series?: { title: string } | null
}

export interface BlogCardData {
  id: string
  slug: string
  title: string
  summary: string
  date: string
  readingLabel: string
  contentFormatLabel: string | null
  categoryName: string | null
  seriesTitle: string | null
  search?: { query: string; snippet: string | null; sourceOnly: boolean }
}

export function toBlogCard(post: CardSource, search = ""): BlogCardData {
  const query = search.trim()
  const presentation = getPostPresentation(post)
  // Keep markup out of snippets. All display values are escaped by React, never inserted as HTML.
  const snippet = query && post.content ? searchContext(extractPlainText(post.content), query) : null
  const titleMatches = query ? post.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : false
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: presentation.summary,
    date: (post.publishedAt ?? post.createdAt).toISOString(),
    readingLabel: presentation.readingLabel,
    contentFormatLabel: presentation.contentFormatLabel,
    categoryName: post.category?.name ?? null,
    seriesTitle: post.series?.title ?? null,
    ...(query ? { search: { query, snippet, sourceOnly: !snippet && !titleMatches } } : {}),
  }
}
