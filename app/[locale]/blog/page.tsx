import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { BlogFilters } from "@/components/blog/BlogFilters"
import { BlogCard } from "@/components/blog/BlogCard"

export const dynamic = "force-dynamic"
export const revalidate = 3600

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string; search?: string }>
}) {
  const { locale } = await params
  const { category, search } = await searchParams
  const t = await getTranslations("blog")

  // 获取所有 BLOG 类型的分类
  const categories = await prisma.category.findMany({
    where: { type: "BLOG" },
    orderBy: { sortOrder: "asc" },
  })

  // 构建查询条件
  const where = {
    status: "PUBLISHED" as const,
    ...(category ? { categoryId: category } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { excerpt: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })

  return (
    <section className="py-16">
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Suspense>
          <BlogFilters categories={categories} />
        </Suspense>
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">还没有文章。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((p) => (
              <BlogCard key={p.id} post={p} locale={locale} />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
