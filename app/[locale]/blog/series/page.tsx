import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { Link } from "@/i18n/navigation"
import { BlogBrowseNav } from "@/components/blog/BlogBrowseNav"
import { JsonLd } from "@/components/seo/JsonLd"
import { absoluteUrl } from "@/lib/site"
import { breadcrumbJsonLd } from "@/lib/structured-data"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const title = "博客系列"
  const description = "按主题连续阅读 Agent、Python 与 Web 工程文章。"
  const pathname = "/zh/blog/series"
  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: { title, description, url: absoluteUrl(pathname), locale: "zh_CN" },
  }
}

export default async function SeriesIndexPage() {
  const t = await getTranslations("blog")
  const series = await prisma.series.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { _count: { select: { posts: { where: { status: "PUBLISHED" } } } } },
  })
  const visible = series.filter((item) => item._count.posts > 0)

  return (
    <section className="py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
        { name: "系列", url: absoluteUrl("/zh/blog/series") },
      ])} />
      <Container>
        <h1 className="mb-2 text-3xl font-bold">{t("allSeries")}</h1>
        <p className="mb-8 text-muted-foreground">{t("seriesDescription")}</p>
        <BlogBrowseNav />
        {visible.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{t("noSeries")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((item) => (
              <Link key={item.id} href={`/blog/series/${item.slug}`} className="rounded-lg border border-border/60 p-5 transition-colors hover:border-border hover:bg-muted/40">
                <h2 className="font-semibold text-foreground">{item.title}</h2>
                {item.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.description}</p>}
                <p className="mt-3 text-xs text-muted-foreground">{t("postsCount", { count: item._count.posts })}</p>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
