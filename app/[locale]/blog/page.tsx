import { Suspense } from "react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { BlogFilters } from "@/components/blog/BlogFilters"
import { BlogCard } from "@/components/blog/BlogCard"
import { BlogBrowseNav } from "@/components/blog/BlogBrowseNav"
import { JsonLd } from "@/components/seo/JsonLd"
import { absoluteUrl } from "@/lib/site"
import { breadcrumbJsonLd } from "@/lib/structured-data"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "blog" })
  const pathname = "/zh/blog"

  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: {
      canonical: pathname,
    },
    openGraph: {
      title: t("metadataTitle"),
      description: t("metadataDescription"),
      url: pathname,
      locale: "zh_CN",
    },
  }
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>
}) {
  const { category, search } = await searchParams
  const t = await getTranslations("blog")

  const categories = await prisma.category.findMany({
    where: { type: "BLOG" },
    orderBy: { sortOrder: "asc" },
  })

  const where = {
    status: "PUBLISHED" as const,
    ...(category ? { categoryId: category } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { content: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { category: true, series: true },
  })

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
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => (
              <BlogCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
