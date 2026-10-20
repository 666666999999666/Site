import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { RecentPosts } from "../components/home/RecentPosts"
import { homePostSelect, toHomePost, type HomePostData } from "../lib/home-posts"
import { homePostFixture, homePostRenderingFixtures } from "./fixtures/home-posts"
import originalMarkup from "./fixtures/home-posts-markup.json"
import zh from "../messages/zh.json"

function renderPosts(posts: HomePostData[]) {
  // eslint-disable-next-line react/no-children-prop
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "zh", timeZone: "Asia/Shanghai", messages: zh, children: createElement(RecentPosts, { posts }) }))
}

test("homepage DTO allowlists visible fields and nested names without normalizing the excerpt", () => {
  assert.deepEqual(toHomePost(homePostFixture), {
    id: "home-one", slug: "home-one", title: "首页原始摘要 <script>",
    excerpt: "  **保留原始 Markdown**\n<script>摘要原文</script>  ",
    date: "2026-10-01T16:30:00.000Z", readTime: 9,
    category: { name: "工程" }, series: { title: "系列" },
  })
  assert.deepEqual(homePostSelect, {
    id: true, slug: true, title: true, excerpt: true, publishedAt: true, createdAt: true, readTime: true,
    category: { select: { name: true } }, series: { select: { title: true } },
  })
  const fallback = toHomePost(homePostRenderingFixtures[1])
  assert.equal(fallback.date, homePostFixture.createdAt.toISOString())
  assert.equal(fallback.excerpt, null)
  assert.equal(fallback.category, null)
  assert.equal(fallback.series, null)
})

test("homepage serialized fixture omits body and internal metadata even from over-complete input", (context) => {
  const original = Array.from({ length: 6 }, (_, index) => ({ ...homePostFixture, id: `post-${index}` }))
  const cards = original.map(toHomePost)
  const serialized = JSON.stringify(cards)
  for (const marker of ["home-body-private-marker", "category-internal-marker", "category-description-private-marker", "series-internal-marker", "series-slug-private-marker", "series-description-private-marker", "tag-private-marker", "cover-private-marker", "draft-private-marker", "inbox-private-marker", "这条阅读提示不用于首页"]) {
    assert.equal(serialized.includes(marker), false, marker)
  }
  const before = Buffer.byteLength(JSON.stringify(original))
  const after = Buffer.byteLength(serialized)
  assert.ok(after < 2_500)
  assert.ok(after < before / 100)
  context.diagnostic(`Six synthetic long posts: ${before} bytes full records -> ${after} bytes homepage DTOs (${(100 * (1 - after / before)).toFixed(2)}% smaller).`)
})

test("homepage markup exactly matches the pre-refactor populated and empty fixtures", () => {
  const markup = renderPosts(homePostRenderingFixtures.map(toHomePost))
  assert.equal(markup, originalMarkup.populated)
  assert.equal(renderPosts([]), originalMarkup.empty)
  assert.match(markup, /line-clamp-2 mb-3/)
  assert.match(markup, /\*\*保留原始 Markdown\*\*/)
  assert.match(markup, /&lt;script&gt;摘要原文&lt;\/script&gt;/)
  assert.match(markup, /9分钟阅读/)
  assert.match(markup, /0分钟阅读/)
  assert.match(markup, /2026年10月2日/)
  assert.match(markup, /2027年1月1日/)
  assert.doesNotMatch(markup, /<script>|home-body-private-marker|这条阅读提示不用于首页/)
})

test("recent-post query keeps published-only ordering and returns bounded DTOs at both limits", async () => {
  const globalDatabase = globalThis as unknown as { prisma: unknown }
  const originalDatabase = globalDatabase.prisma
  const limits = [5, 6]
  globalDatabase.prisma = {
    post: { findMany: async (query: unknown) => {
      assert.deepEqual(query, {
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: limits.shift(), select: homePostSelect,
      })
      return [homePostFixture]
    } },
  }
  try {
    const { getRecentPosts } = await import("../lib/posts")
    assert.deepEqual(await getRecentPosts(), [toHomePost(homePostFixture)])
    assert.deepEqual(await getRecentPosts(6), [toHomePost(homePostFixture)])
    assert.equal(limits.length, 0)
  } finally {
    globalDatabase.prisma = originalDatabase
  }
})
