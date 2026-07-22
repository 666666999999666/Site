"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import type { Post, Category } from "@/lib/generated/prisma/client"

type PostWithCategory = Post & { category: Category | null }

function formatDate(d: Date, locale: string) {
  return new Date(d).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function BlogCard({ post, locale }: { post: PostWithCategory; locale: string }) {
  const t = useTranslations("blog")

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="border border-border/50 rounded-lg p-5 transition-all group-hover:border-border group-hover:bg-muted/50">
        {post.category && (
          <span className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            {post.category.name}
          </span>
        )}
        <h3 className="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors mb-2 line-clamp-2">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <time>{formatDate(post.publishedAt ?? post.createdAt, locale)}</time>
          <span>·</span>
          <span>{t("minuteRead", { count: post.readTime })}</span>
        </div>
      </article>
    </Link>
  )
}
