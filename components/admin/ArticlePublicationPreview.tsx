"use client"

import { Eye } from "lucide-react"
import { NextIntlClientProvider } from "next-intl"
import { PostContent } from "@/components/blog/PostContent"
import zhMessages from "@/messages/zh.json"
import { getPostPresentation, type PublicationContent } from "@/lib/publication-content"

export function ArticlePublicationPreview({ content, label = "发布效果预览", publication }: {
  content: string
  label?: string
  publication?: Omit<PublicationContent, "content">
}) {
  const details = { ...publication, content }
  const presentation = publication ? getPostPresentation(details) : null
  return (
    <section className="rounded-xl border border-border/70 bg-card" aria-label={label}>
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4 text-sm font-medium text-muted-foreground">
        <Eye className="size-4" />
        {label}
      </div>
      {presentation && <div className="border-b border-border/60 px-5 py-4 sm:px-6">
        <p className="text-xs font-medium text-muted-foreground">卡片、RSS 与搜索摘要</p>
        <p className="mt-2 text-sm leading-relaxed">{presentation.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground">{presentation.contentFormatLabel ? `${presentation.contentFormatLabel} · ` : ""}{presentation.readingLabel}</p>
      </div>}
      <div className="p-5 sm:p-6">
        {content.trim() ? (
          <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={{ content: zhMessages.content }}>
            <PostContent content={content} />
          </NextIntlClientProvider>
        ) : (
          <p className="text-sm text-muted-foreground">{label === "文章正文" ? "暂无正文。" : "输入正文后在这里查看公开文章的实际排版。"}</p>
        )}
      </div>
    </section>
  )
}
