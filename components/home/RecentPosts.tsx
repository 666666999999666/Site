"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"
import type { Post, Category } from "@/lib/generated/prisma/client"

type PostWithCategory = Post & { category: Category | null }

function formatDate(d: Date, locale: string) {
  return new Date(d).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function RecentPosts({ posts, locale }: { posts: PostWithCategory[]; locale: string }) {
  const t = useTranslations("home")

  if (posts.length === 0) {
    return (
      <section className="py-16">
        <Container>
          <p className="text-center text-muted-foreground">还没有文章，开始写下第一篇吧。</p>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-16">
      <Container>
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-2xl font-bold text-foreground">{t("latestPosts")}</h2>
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("viewAll")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group block">
              <article className="border border-border/50 rounded-lg p-5 transition-all group-hover:border-border group-hover:bg-muted/50">
                {p.category && (
                  <span className="text-xs text-muted-foreground mb-2 block">
                    {p.category.name}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors mb-2 line-clamp-2">
                  {p.title}
                </h3>
                {p.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.excerpt}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <time>{formatDate(p.publishedAt ?? p.createdAt, locale)}</time>
                  <span>·</span>
                  <span>{t("minuteRead", { count: p.readTime })}</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  )
}
