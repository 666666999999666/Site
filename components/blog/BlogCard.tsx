"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import type { BlogCardData } from "@/lib/blog-card"
import { highlightSearchText } from "@/lib/blog-search"

function HighlightedText({ text, query }: { text: string; query: string }) {
  return highlightSearchText(text, query).map((part, index) => part.match
    ? <mark key={index} className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/25">{part.text}</mark>
    : part.text)
}

export function BlogCard({ post, chapter }: { post: BlogCardData; chapter?: number }) {
  const t = useTranslations("blog")
  const query = post.search?.query ?? ""

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="flex flex-col h-full border border-border/50 rounded-lg p-5 transition-all group-hover:border-border group-hover:bg-muted/50">
        {chapter !== undefined && <p className="mb-2 text-xs font-medium text-primary">{t("seriesChapter", { number: chapter })}</p>}
        {(post.categoryName || post.seriesTitle || post.contentFormatLabel) && (
          <span className="mb-2 block text-xs text-muted-foreground">
            {[post.seriesTitle, post.categoryName, post.contentFormatLabel].filter(Boolean).join(" · ")}
          </span>
        )}
        <h3 className="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors mb-2 line-clamp-2">
          <HighlightedText text={post.title} query={query} />
        </h3>
        {post.search?.snippet ? (
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="mb-1 block text-xs">{t("bodyMatch")}</span>
            <HighlightedText text={post.search.snippet} query={query} />
          </p>
        ) : (
          <>
            {post.summary && <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{post.summary}</p>}
            {post.search?.sourceOnly && <p className="mb-3 text-xs text-muted-foreground">{t("sourceMatch")}</p>}
          </>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "Asia/Shanghai",
            })}
          </time>
          <span>·</span>
          <span>{post.readingLabel}</span>
        </div>
      </article>
    </Link>
  )
}
