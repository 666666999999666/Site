"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

export function BlogBrowseNav() {
  const t = useTranslations("blog")

  return (
    <nav aria-label={t("browse")} className="mb-8 flex flex-wrap gap-2">
      <Link href="/blog/series" className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
        {t("series")}
      </Link>
      <Link href="/blog/tags" className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
        {t("tags")}
      </Link>
      <Link href="/blog/archive" className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
        {t("archive")}
      </Link>
      <a href="/feed.xml" className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
        {t("rss")}
      </a>
    </nav>
  )
}
