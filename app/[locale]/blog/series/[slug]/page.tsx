import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/public-metadata"
import { cache } from "react"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Link } from "@/i18n/navigation"
import { blogCardSelect, toBlogCard } from "@/lib/blog-card"
import { seriesDisplayPosition, seriesPostOrder } from "@/lib/series-order"
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
      orderBy: seriesPostOrder,
      select: blogCardSelect,
    },
  },
}))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const series = await getSeries(slug)
  if (!series) return {}
  const description = series.description || `“${series.title}”系列文章目录。`
  const pathname = `/zh/blog/series/${series.slug}`
  return publicPageMetadata({
    title: series.title,
    description,
    pathname,
    openGraph: {
      url: absoluteUrl(pathname),
      ...(series.coverImage ? { images: [absoluteUrl(series.coverImage)] } : {}),
    },
  })
}

export default async function SeriesPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const series = await getSeries(slug)
  if (!series) notFound()
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
        {series.description && <p className="mb-8 max-w-3xl whitespace-pre-line text-muted-foreground">{series.description}</p>}
        <BlogBrowseNav />
        {series.posts.length > 0 ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <Link href={`/blog/${series.posts[0].slug}`} className="inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">{t("startSeries")}</Link>
              <p className="text-sm text-muted-foreground">{t("seriesOrderDescription")}</p>
            </div>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {series.posts.map((post, index) => <li key={post.id}><BlogCard post={toBlogCard(post)} chapter={seriesDisplayPosition(index)} /></li>)}
            </ol>
          </>
        ) : <p className="py-12 text-center text-muted-foreground">{t("seriesEmpty")}</p>}
      </Container>
    </section>
  )
}
