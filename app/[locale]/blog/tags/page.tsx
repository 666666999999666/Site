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
  title: "博客标签",
  description: "按标签查找 Agent、Python 与 Web 工程文章。",
  alternates: { canonical: "/zh/blog/tags" },
  openGraph: { title: "博客标签", description: "按标签查找技术文章。", url: absoluteUrl("/zh/blog/tags"), locale: "zh_CN" },
}

export default async function TagsPage() {
  const t = await getTranslations("blog")
  const posts = await prisma.post.findMany({ where: { status: "PUBLISHED" }, select: { tags: true } })
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of new Set(post.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))

  return (
    <section className="py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd([
        { name: "首页", url: absoluteUrl("/zh") },
        { name: "博客", url: absoluteUrl("/zh/blog") },
        { name: "标签", url: absoluteUrl("/zh/blog/tags") },
      ])} />
      <Container>
        <h1 className="mb-2 text-3xl font-bold">{t("allTags")}</h1>
        <p className="mb-8 text-muted-foreground">{t("tagsDescription")}</p>
        <BlogBrowseNav />
        {tags.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{t("noTags")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tags.map(([tag, count]) => (
              <Link key={tag} href={`/blog/tags/${encodeURIComponent(tag)}`} className="rounded-full border border-border/60 px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
                #{tag} <span className="ml-1 text-xs">{count}</span>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
