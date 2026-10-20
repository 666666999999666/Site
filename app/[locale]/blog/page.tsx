import { Suspense } from "react"
import type { Metadata } from "next"
import { publicPageMetadata } from "@/lib/public-metadata"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { BlogFilters } from "@/components/blog/BlogFilters"
import { BlogCard } from "@/components/blog/BlogCard"
import { BlogBrowseNav } from "@/components/blog/BlogBrowseNav"
import { JsonLd } from "@/components/seo/JsonLd"
import { absoluteUrl } from "@/lib/site"
import { breadcrumbJsonLd } from "@/lib/structured-data"
import { blogCardSelect, toBlogCard } from "@/lib/blog-card"
import { literalContainsSearch } from "@/lib/blog-search"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "blog" })
  const pathname = "/zh/blog"

  return publicPageMetadata({
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    pathname,
  })
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>
}) {
  const { category, search: rawSearch } = await searchParams
  const search = rawSearch?.trim() ?? ""
  const t = await getTranslations("blog")

  const categories = await prisma.category.findMany({
    where: { type: "BLOG" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })

  const searchPattern = literalContainsSearch(search)
  const where = {
    status: "PUBLISHED" as const,
    ...(category ? { categoryId: category } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: searchPattern, mode: "insensitive" as const } },
            { content: { contains: searchPattern, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: blogCardSelect,
  })

  const hasFilters = Boolean(category || search)
  const categoryName = categories.find((item) => item.id === category)?.name ?? t("unknownCategory")

  return (
    <section className="py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
      ])} />
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <BlogBrowseNav />
        <Suspense>
          <BlogFilters categories={categories} />
        </Suspense>
        {hasFilters && (
          <div className="mb-6 space-y-1 text-sm" role="status" aria-live="polite" aria-atomic="true">
            <p className="font-medium">{t("searchResults", { count: posts.length })}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 break-words text-muted-foreground">
              {search && <span>{t("filterSearch", { search })}</span>}
              {category && <span>{t("filterCategory", { category: categoryName })}</span>}
            </div>
          </div>
        )}
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t(hasFilters ? "noMatches" : "empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => (
              <BlogCard key={p.id} post={toBlogCard(p, search)} />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
