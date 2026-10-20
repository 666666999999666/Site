import { Suspense } from "react"
import { NextIntlClientProvider } from "next-intl"
import { BlogFilters } from "@/components/blog/BlogFilters"
import { BlogCard } from "@/components/blog/BlogCard"
import { toBlogCard } from "@/lib/blog-card"
import zh from "@/messages/zh.json"

const posts = [
  { id: "one", slug: "one", title: "工具调用的工程记录", excerpt: "独立摘要一", categoryId: "engineering", category: { name: "工程" }, content: "body-start-not-for-browser" + "很长的非命中正文。".repeat(8_000) + "正文中的 Harness 负责协调工具调用。" + "很长的非命中正文。".repeat(8_000) },
  { id: "two", slug: "two", title: "Harness 使用说明", excerpt: "独立摘要二", categoryId: "notes", category: { name: "笔记" }, content: "中文组合输入与 Harness 案例。" },
  { id: "three", slug: "three", title: "特殊字符", excerpt: "特殊字符摘要", categoryId: "engineering", category: { name: "工程" }, content: "关键词包括 harness+skill 和 `<script>`，以及中文学习。" },
]

export default async function DiscoveryHarness({ searchParams }: { searchParams: Promise<{ search?: string; category?: string }> }) {
  const params = await searchParams
  const query = params.search?.trim() ?? ""
  const matches = posts.filter((post) => (!params.category || post.categoryId === params.category) && (!query || `${post.title} ${post.content}`.toLowerCase().includes(query.toLowerCase())))
  return <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={zh} formats={{}} now={new Date("2026-10-01T00:00:00.000Z")}>
    <main className="mx-auto max-w-5xl p-6">
      <Suspense><BlogFilters categories={[{ id: "engineering", name: "工程" }, { id: "notes", name: "笔记" }]} /></Suspense>
      <p role="status">找到 {matches.length} 篇文章</p>
      {matches.length === 0 && <p>当前搜索或分类条件下没有匹配文章。</p>}
      <div className="grid gap-4 sm:grid-cols-2">{matches.map((post) => <BlogCard key={post.id} post={toBlogCard({ ...post, publishedAt: new Date("2026-10-01T00:00:00.000Z"), createdAt: new Date("2026-10-01T00:00:00.000Z"), readTime: 4 }, query)} />)}</div>
    </main>
  </NextIntlClientProvider>
}
