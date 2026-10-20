import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/public-metadata"
import { cache } from "react"
import { Link } from "@/i18n/navigation"
import { blogCardSelect, toBlogCard } from "@/lib/blog-card"
import { matchesTagRoute, normalizeTags } from "@/lib/tags"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { BlogCard } from "@/components/blog/BlogCard"
import { BlogBrowseNav } from "@/components/blog/BlogBrowseNav"
import { JsonLd } from "@/components/seo/JsonLd"
import { absoluteUrl } from "@/lib/site"
import { breadcrumbJsonLd } from "@/lib/structured-data"
import { decodeRouteSegment } from "@/lib/route-segment"

export const dynamic = "force-dynamic"

// Read only tag metadata across the small corpus, then fetch cards only for matching IDs.
const getTagPosts = cache(async (tag: string) => {
  const index = await prisma.post.findMany({ where: { status: "PUBLISHED" }, select: { id: true, tags: true } })
  const ids = index.filter((post) => matchesTagRoute(post.tags, tag)).map((post) => post.id)
  if (!ids.length) return []
  return prisma.post.findMany({
    where: { status: "PUBLISHED", id: { in: ids } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: blogCardSelect,
  })
})

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag: rawTag } = await params
  const tag = decodeRouteSegment(rawTag)
  const pathname = `/zh/blog/tags/${encodeURIComponent(tag)}`
  return publicPageMetadata({
    title: `#${tag}`,
    description: `标签“${tag}”下的博客文章。`,
    pathname,
    openGraph: { url: absoluteUrl(pathname) },
  })
}

export default async function TagPage({ params }: { params: Promise<{ locale: string; tag: string }> }) {
  const { tag: rawTag } = await params
  const tag = decodeRouteSegment(rawTag)
  const [t, posts] = await Promise.all([
    getTranslations("blog"),
    getTagPosts(tag),
  ])
  if (posts.length === 0) notFound()
  const normalizedTags = normalizeTags([tag])
  const pathname = `/zh/blog/tags/${encodeURIComponent(tag)}`

  return (
    <section className="py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
        { name: "标签", url: absoluteUrl("/zh/blog/tags") },
        { name: tag, url: absoluteUrl(pathname) },
      ])} />
      <Container>
        <h1 className="mb-2 text-3xl font-bold">{t("taggedWith", { tag })}</h1>
        <p className="mb-8 text-muted-foreground">{t("postsCount", { count: posts.length })}</p>
        <BlogBrowseNav />
        {normalizedTags.length > 1 && (
          <div className="mb-6 rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">
            <p className="mb-2">{t("compositeTagNotice")}</p>
            <div className="flex flex-wrap gap-3">{normalizedTags.map((item) => <Link key={item} href={`/blog/tags/${encodeURIComponent(item)}`} className="text-primary hover:underline">#{item}</Link>)}</div>
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => <BlogCard key={post.id} post={toBlogCard(post)} />)}
        </div>
      </Container>
    </section>
  )
}
