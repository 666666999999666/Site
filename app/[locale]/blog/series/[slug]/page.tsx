import type { Metadata } from "next"
import { cache } from "react"
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

const getSeries = cache((slug: string) => prisma.series.findUnique({
  where: { slug: decodeRouteSegment(slug) },
  include: {
    posts: {
      where: { status: "PUBLISHED" },
      orderBy: [{ seriesOrder: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      include: { category: true },
    },
  },
}))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const series = await getSeries(slug)
  if (!series) return {}
  const description = series.description || `“${series.title}”系列文章目录。`
  const pathname = `/zh/blog/series/${series.slug}`
  return {
    title: series.title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      title: series.title,
      description,
      url: absoluteUrl(pathname),
      locale: "zh_CN",
      ...(series.coverImage ? { images: [absoluteUrl(series.coverImage)] } : {}),
    },
  }
}

export default async function SeriesPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const series = await getSeries(slug)
  if (!series || series.posts.length === 0) notFound()
  const t = await getTranslations("blog")

  return (
    <section className="py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
        { name: "系列", url: absoluteUrl("/zh/blog/series") },
        { name: series.title, url: absoluteUrl(`/zh/blog/series/${series.slug}`) },
      ])} />
      <Container>
        <p className="mb-2 text-sm text-muted-foreground">{t("series")}</p>
        <h1 className="mb-3 text-3xl font-bold">{series.title}</h1>
        {series.description && <p className="mb-8 max-w-3xl text-muted-foreground">{series.description}</p>}
        <BlogBrowseNav />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {series.posts.map((post) => <BlogCard key={post.id} post={post} />)}
        </div>
      </Container>
    </section>
  )
}
