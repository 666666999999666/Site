import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/public-metadata"
import { cache } from "react"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
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
import { relatedPostReason, selectPostRecommendations } from "@/lib/related-posts"
import { seriesDisplayPosition, seriesPostOrder } from "@/lib/series-order"
import { blogCardSelect, toBlogCard } from "@/lib/blog-card"
import { normalizeTags } from "@/lib/tags"
import { getArticleImageMetadata } from "@/lib/article-images"
import { getPostSummary, getPostPresentation } from "@/lib/publication-content"

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
  const description = getPostSummary(post)
  const image = articleOpenGraphImage(post.title, post.coverImage)
  return publicPageMetadata({
    title: post.title,
    description,
    pathname,
    openGraph: {
      type: "article",
      url: absoluteUrl(pathname),
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      tags: normalizeTags(post.tags),
      images: [{
        url: absoluteUrl(image.path),
        alt: image.alt,
        ...("width" in image
          ? { width: image.width, height: image.height }
          : {}),
      }],
    },
  })
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") notFound()

  const [t, settings, imageMetadata, sequence, candidates] = await Promise.all([
    getTranslations("blog"),
    getPublicSettings(),
    getArticleImageMetadata(post.content),
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        ...(post.seriesId ? { seriesId: post.seriesId } : {}),
      },
      orderBy: post.seriesId ? seriesPostOrder : [{ publishedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, title: true, seriesOrder: true },
    }),
    prisma.post.findMany({
      where: { status: "PUBLISHED", id: { not: post.id } },
      select: { id: true, seriesId: true, categoryId: true, tags: true, publishedAt: true, createdAt: true },
    }),
  ])

  const presentation = getPostPresentation(post)
  const headings = extractHeadings(post.content)
  const tags = normalizeTags(post.tags)
  const recommendations = selectPostRecommendations(post, candidates, 3)
  const recommendedPosts = recommendations.posts.length ? await prisma.post.findMany({
    where: { id: { in: recommendations.posts.map((item) => item.id) }, status: "PUBLISHED" },
    select: blogCardSelect,
  }) : []
  const related = recommendations.posts.flatMap((candidate) => {
    const item = recommendedPosts.find((item) => item.id === candidate.id)
    return item ? [{ ...toBlogCard(item), reason: relatedPostReason(post, candidate) }] : []
  })
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
    description: presentation.summary,
    mainEntityOfPage: articleUrl,
    url: articleUrl,
    datePublished: publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    inLanguage: "zh-CN",
    keywords: tags,
    image: absoluteUrl(articleImage.path),
    author: {
      "@type": "Person",
      name: settings.owner_name,
      url: absoluteUrl("/zh/about"),
    },
  }

  return (
    <section className="article-page py-12">
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
        <div className={`flex gap-12${headings.length === 0 ? " justify-center" : ""}`}>
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
                <span>{presentation.readingLabel}</span>
                {presentation.contentFormatLabel && <><span>·</span><span>{presentation.contentFormatLabel}</span></>}
              </div>
            </header>

            <PostContent content={post.content} imageMetadata={imageMetadata} />

            {tags.length > 0 && (
              <div className="mt-16 border-t border-border/50 pt-6">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
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
              <nav aria-label={t("postNavigation")} className="mt-10 grid gap-3 sm:grid-cols-2">
                {previous ? (
                  <Link href={`/blog/${previous.slug}`} className="rounded-lg border border-border/60 p-4 transition-colors hover:border-border hover:bg-muted/40">
                    <span className="block text-xs text-muted-foreground">← {t(post.seriesId ? "previousPost" : "previousChronologicalPost")}</span>
                    <span className="mt-1 block font-medium">{previous.title}</span>
                  </Link>
                ) : <span />}
                {next && (
                  <Link href={`/blog/${next.slug}`} className="rounded-lg border border-border/60 p-4 text-right transition-colors hover:border-border hover:bg-muted/40">
                    <span className="block text-xs text-muted-foreground">{t(post.seriesId ? "nextPost" : "nextChronologicalPost")} →</span>
                    <span className="mt-1 block font-medium">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            {related.length > 0 && (
              <section className="mt-14" aria-labelledby="related-posts-heading">
                <h2 id="related-posts-heading" className="mb-5 text-xl font-semibold">{t(recommendations.kind === "related" ? "relatedPosts" : "latestPosts")}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {related.map(({ reason, ...item }) => (
                    <div key={item.id} className="flex flex-col gap-2">
                      {recommendations.kind === "related" && reason && (
                        <p className="text-xs text-muted-foreground">{t(reason === "series" ? "relatedBySeries" : reason === "category" ? "relatedByCategory" : "relatedByTag")}</p>
                      )}
                      <BlogCard post={item} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>

          {headings.length > 0 && (
            <aside className="hidden w-56 shrink-0 lg:block">
              <TableOfContents headings={headings} />
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
