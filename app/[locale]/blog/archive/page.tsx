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

export const metadata: Metadata = {
  title: "博客归档",
  description: "按发布时间浏览历史文章。",
  alternates: { canonical: "/zh/blog/archive" },
  openGraph: { title: "博客归档", description: "按发布时间浏览历史文章。", url: absoluteUrl("/zh/blog/archive"), locale: "zh_CN" },
}

export default async function ArchivePage() {
  const [t, posts] = await Promise.all([
    getTranslations("blog"),
    prisma.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true, slug: true, publishedAt: true, createdAt: true },
    }),
  ])
  const years = new Map<number, typeof posts>()
  for (const post of posts) {
    const date = post.publishedAt ?? post.createdAt
    const year = Number(new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Shanghai",
    }).format(date))
    years.set(year, [...(years.get(year) ?? []), post])
  }

  return (
    <section className="py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
        { name: "归档", url: absoluteUrl("/zh/blog/archive") },
      ])} />
      <Container size="narrow">
        <h1 className="mb-2 text-3xl font-bold">{t("archive")}</h1>
        <p className="mb-8 text-muted-foreground">{t("archiveDescription")}</p>
        <BlogBrowseNav />
        <div className="space-y-10">
          {[...years.entries()].map(([year, yearPosts]) => (
            <section key={year} aria-labelledby={`archive-${year}`}>
              <h2 id={`archive-${year}`} className="mb-4 text-xl font-semibold">{year}</h2>
              <ol className="space-y-3 border-l border-border pl-5">
                {yearPosts.map((post) => {
                  const date = post.publishedAt ?? post.createdAt
                  return (
                    <li key={post.id} className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4">
                      <time dateTime={date.toISOString()} className="text-sm text-muted-foreground">
                        {date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" })}
                      </time>
                      <Link href={`/blog/${post.slug}`} className="font-medium text-foreground hover:underline">{post.title}</Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      </Container>
    </section>
  )
}
