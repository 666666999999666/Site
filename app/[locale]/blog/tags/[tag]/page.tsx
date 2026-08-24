import type { Metadata } from "next"
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

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag: rawTag } = await params
  const tag = decodeRouteSegment(rawTag)
  const pathname = `/zh/blog/tags/${encodeURIComponent(tag)}`
  return {
    title: `#${tag}`,
    description: `标签“${tag}”下的博客文章。`,
    alternates: { canonical: pathname },
    openGraph: { title: `#${tag}`, description: `标签“${tag}”下的博客文章。`, url: absoluteUrl(pathname), locale: "zh_CN" },
  }
}

export default async function TagPage({ params }: { params: Promise<{ locale: string; tag: string }> }) {
  const { tag: rawTag } = await params
  const tag = decodeRouteSegment(rawTag)
  const [t, posts] = await Promise.all([
    getTranslations("blog"),
    prisma.post.findMany({
      where: { status: "PUBLISHED", tags: { has: tag } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: { category: true },
    }),
  ])
  if (posts.length === 0) notFound()
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => <BlogCard key={post.id} post={post} />)}
        </div>
      </Container>
    </section>
  )
}
