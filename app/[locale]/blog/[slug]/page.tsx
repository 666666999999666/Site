import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { Link } from "@/i18n/navigation"
import { PostContent } from "@/components/blog/PostContent"
import { TableOfContents } from "@/components/blog/TableOfContents"
import { MobileTableOfContents } from "@/components/blog/MobileTableOfContents"
import { BlogCard } from "@/components/blog/BlogCard"
import { JsonLd } from "@/components/seo/JsonLd"
import { extractHeadings } from "@/lib/content"
import { absoluteUrl } from "@/lib/site"
import { decodeRouteSegment } from "@/lib/route-segment"
import { getPublicSettings } from "@/lib/settings"
import { breadcrumbJsonLd } from "@/lib/structured-data"
import { articleOpenGraphImage } from "@/lib/open-graph"
import { rankRelatedPosts } from "@/lib/related-posts"
import { seriesDisplayPosition } from "@/lib/series-order"

export const dynamic = "force-dynamic"

const getPost = cache(async (slug: string) => prisma.post.findUnique({
  where: { slug: decodeRouteSegment(slug) },
  include: { category: true, series: true },
}))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") return {}
  const pathname = `/zh/blog/${post.slug}`
  const description = post.excerpt || `${post.title} - QZ Site`
  const image = articleOpenGraphImage(post.title, post.coverImage)
  return {
    title: post.title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: absoluteUrl(pathname),
      locale: "zh_CN",
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      tags: post.tags,
      images: [{
        url: absoluteUrl(image.path),
        alt: image.alt,
        ...("width" in image
          ? { width: image.width, height: image.height }
          : {}),
      }],
    },
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") notFound()

  const findRelated = (signal: Prisma.PostWhereInput | null) => signal
    ? prisma.post.findMany({
        where: { id: { not: post.id }, status: "PUBLISHED", ...signal },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 24,
        include: { category: true, series: true },
      })
    : Promise.resolve([])

  const [t, settings, sequence, sameSeries, sameCategory, sharedTags, recent] = await Promise.all([
    getTranslations("blog"),
    getPublicSettings(),
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        ...(post.seriesId ? { seriesId: post.seriesId } : {}),
      },
      orderBy: post.seriesId
        ? [{ seriesOrder: "asc" }, { publishedAt: "asc" }, { createdAt: "asc" }]
        : [{ publishedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, title: true, seriesOrder: true },
    }),
    findRelated(post.seriesId ? { seriesId: post.seriesId } : null),
    findRelated(post.categoryId ? { categoryId: post.categoryId } : null),
    findRelated(post.tags.length > 0 ? { tags: { hasSome: post.tags } } : null),
    findRelated({}),
  ])

  const headings = extractHeadings(post.content)
  const related = rankRelatedPosts(post, [
    ...sameSeries,
    ...sameCategory,
    ...sharedTags,
    ...recent,
  ], 3)
  const sequenceIndex = sequence.findIndex((candidate) => candidate.id === post.id)
  const previous = sequenceIndex > 0 ? sequence[sequenceIndex - 1] : null
  const next = sequenceIndex >= 0 && sequenceIndex < sequence.length - 1
    ? sequence[sequenceIndex + 1]
    : null
  const publishedAt = post.publishedAt ?? post.createdAt
  const date = publishedAt.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  })
  const articleUrl = absoluteUrl(`/zh/blog/${post.slug}`)
  const articleImage = articleOpenGraphImage(post.title, post.coverImage)
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    mainEntityOfPage: articleUrl,
    url: articleUrl,
    datePublished: publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    inLanguage: "zh-CN",
    keywords: post.tags,
    image: absoluteUrl(articleImage.path),
    author: {
      "@type": "Person",
      name: settings.owner_name,
      url: absoluteUrl("/zh/about"),
    },
  }

  return (
    <section className="py-12">
      <JsonLd data={[
        articleJsonLd,
        breadcrumbJsonLd([
          { name: "首页", url: absoluteUrl("/zh") },
          { name: "博客", url: absoluteUrl("/zh/blog") },
          { name: post.title, url: articleUrl },
        ]),
      ]} />
      <MobileTableOfContents headings={headings} />
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex gap-12">
          <article className="min-w-0 max-w-3xl flex-1">
            <header className="mb-10">
              <Link href="/blog" className="mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                ← {t("backLink")}
              </Link>
              {post.series && (
                <p className="mb-3 text-sm">
                  <Link href={`/blog/series/${post.series.slug}`} className="text-primary hover:underline">
                    {post.series.title}{sequenceIndex >= 0 ? ` · ${seriesDisplayPosition(sequenceIndex)}` : ""}
                  </Link>
                </p>
              )}
              <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {post.category && <><span>{post.category.name}</span><span>·</span></>}
                <time dateTime={publishedAt.toISOString()}>{date}</time>
                <span>·</span>
                <span>{t("minuteRead", { count: post.readTime })}</span>
              </div>
            </header>

            <PostContent content={post.content} />

            {post.tags.length > 0 && (
              <div className="mt-16 border-t border-border/50 pt-6">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link key={tag} href={`/blog/tags/${encodeURIComponent(tag)}`} className="rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground">
                      #{tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {post.series && (
              <section className="mt-10 rounded-lg border border-border/60 p-5" aria-labelledby="series-contents-heading">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="series-contents-heading" className="font-semibold">{t("seriesContents")} · {post.series.title}</h2>
                  <Link href={`/blog/series/${post.series.slug}`} className="text-sm text-muted-foreground hover:text-foreground">{t("postsCount", { count: sequence.length })}</Link>
                </div>
                <ol className="space-y-2">
                  {sequence.map((item, index) => (
                    <li key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 text-sm">
                      <span className="text-muted-foreground">{seriesDisplayPosition(index)}</span>
                      <Link href={`/blog/${item.slug}`} aria-current={item.id === post.id ? "page" : undefined} className={item.id === post.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}>
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(previous || next) && (
              <nav aria-label="文章翻页" className="mt-10 grid gap-3 sm:grid-cols-2">
                {previous ? (
                  <Link href={`/blog/${previous.slug}`} className="rounded-lg border border-border/60 p-4 transition-colors hover:border-border hover:bg-muted/40">
                    <span className="block text-xs text-muted-foreground">← {t("previousPost")}</span>
                    <span className="mt-1 block font-medium">{previous.title}</span>
                  </Link>
                ) : <span />}
                {next && (
                  <Link href={`/blog/${next.slug}`} className="rounded-lg border border-border/60 p-4 text-right transition-colors hover:border-border hover:bg-muted/40">
                    <span className="block text-xs text-muted-foreground">{t("nextPost")} →</span>
                    <span className="mt-1 block font-medium">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            {related.length > 0 && (
              <section className="mt-14" aria-labelledby="related-posts-heading">
                <h2 id="related-posts-heading" className="mb-5 text-xl font-semibold">{t("relatedPosts")}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {related.map((item) => <BlogCard key={item.id} post={item} />)}
                </div>
              </section>
            )}
          </article>

          <aside className="hidden w-56 shrink-0 lg:block">
            <TableOfContents headings={headings} />
          </aside>
        </div>
      </div>
    </section>
  )
}
