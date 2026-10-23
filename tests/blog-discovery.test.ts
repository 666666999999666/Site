import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { BlogCard } from "../components/blog/BlogCard"
import zh from "../messages/zh.json"
import { toBlogCard } from "../lib/blog-card"
import { highlightSearchText, literalContainsSearch, resetBlogFilters, searchContext, updateBlogFilters } from "../lib/blog-search"
import { countPublicTags, matchesTagRoute, normalizeTags, planTagNormalization, splitTagTokens } from "../lib/tags"
import { rankRelatedPosts, relatedPostReason, selectPostRecommendations } from "../lib/related-posts"
import { seriesPostOrder } from "../lib/series-order"
import { buildRssFeed } from "../lib/rss"

const date = new Date("2026-10-01T00:00:00.000Z")
const basePost = {
  id: "a", slug: "article-a", title: "工程记录", excerpt: "简短摘要", content: "前言。\n\n正文介绍 Harness 如何工作。\n\n末尾。",
  publishedAt: date, createdAt: date, readTime: 4, category: { name: "技术" }, series: { title: "工程" },
}

test("card DTO drops body and internal fields and bounds server-created search context", () => {
  const content = "start-marker-should-not-leak" + "非常长的正文。".repeat(20_000) + " Harness 的工作原理。" + "结尾。".repeat(1_000)
  const card = toBlogCard({ ...basePost, content }, "HARNESS")
  assert.equal(Object.hasOwn(card, "content"), false)
  assert.equal(Object.hasOwn(card, "createdAt"), false)
  assert.equal(card.search?.sourceOnly, false)
  assert.match(card.search?.snippet ?? "", /Harness/)
  assert.ok((card.search?.snippet?.length ?? 0) <= 182)
  assert.ok(JSON.stringify(card).length < 1_500)
  assert.doesNotMatch(JSON.stringify(card), /start-marker-should-not-leak/)
  assert.equal(toBlogCard(basePost).search, undefined)
})

test("search explains visible body hits and honestly identifies source-only hits", () => {
  assert.match(toBlogCard(basePost, "harness").search?.snippet ?? "", /Harness/)
  const linkPost = { ...basePost, content: "参见[官方文档](https://example.test/harness)." }
  assert.equal(toBlogCard(linkPost, "harness").search?.sourceOnly, true)
  assert.equal(toBlogCard({ ...linkPost, title: "Harness" }, "harness").search?.sourceOnly, false)
})

test("highlighting uses literal Unicode text instead of executable markup or regex syntax", () => {
  for (const [text, query, matches] of [
    ["Harness harness", "HARNESS", 2],
    ["中文学习与中文实践", "中文", 2],
    ["a+b [x] .*", ".*", 1],
    ["<script>alert(1)</script>", "<script>", 1],
    ["İ i and i", "i", 2],
  ] as const) {
    const parts = highlightSearchText(text, query)
    assert.equal(parts.map((part) => part.text).join(""), text)
    assert.equal(parts.filter((part) => part.match).length, matches)
  }
  assert.deepEqual(highlightSearchText("保持原文", " "), [{ text: "保持原文", match: false }])
  assert.equal(searchContext("无匹配", "不存在"), null)
  assert.equal(searchContext("中文\n\n学习", "学习"), "中文 学习")
})

test("clear-search retains category and other URL state while reset removes only filters", () => {
  const query = "category=technical&search=harness%2Bskill&from=archive"
  const clear = new URLSearchParams(updateBlogFilters(query, "search", ""))
  assert.equal(clear.get("category"), "technical")
  assert.equal(clear.get("search"), null)
  assert.equal(clear.get("from"), "archive")
  assert.equal(resetBlogFilters(query), "from=archive")
  const changed = new URLSearchParams(updateBlogFilters(query, "category", "new-category"))
  assert.equal(changed.get("search"), "harness+skill")
  assert.equal(changed.get("category"), "new-category")
})

test("tags split only obvious separators and retain distinct semantic and case choices", () => {
  assert.deepEqual(normalizeTags([" Agent、Harness, 工具，学习 ", "Agent", "harness", "Harness Engineering"]), ["Agent", "Harness", "工具", "学习", "harness", "Harness Engineering"])
  assert.deepEqual(countPublicTags([{ tags: ["Agent、Harness", "Agent"] }, { tags: ["Agent"] }]), [["Agent", 2], ["Harness", 1]])
  assert.equal(matchesTagRoute(["Agent、Harness"], "Harness"), true)
  assert.equal(matchesTagRoute(["Harness"], "Agent、Harness"), true)
  assert.equal(matchesTagRoute(["Python"], "Agent、Harness"), false)
  assert.equal(matchesTagRoute(["Harness Engineering"], "Harness"), false)
})

test("tag dry-run reports affected posts, URL compatibility and deduplication without mutation", () => {
  const input = [{ id: "one", slug: "one", tags: ["Agent、Harness", "Agent"] }, { id: "two", slug: "two", tags: ["Python"] }]
  const original = JSON.stringify(input)
  const plan = planTagNormalization(input)
  assert.equal(plan.length, 1)
  assert.deepEqual(plan[0].after, ["Agent", "Harness"])
  assert.equal(plan[0].collapsedDuplicates, 1)
  assert.equal(plan[0].oldUrls[0], "/zh/blog/tags/Agent%E3%80%81Harness")
  assert.equal(plan[0].needsAuthorReview, false)
  assert.equal(JSON.stringify(input), original)
})

test("related cards never pad with unrelated entries; fallback is explicitly latest", () => {
  const current = { id: "current", seriesId: null, categoryId: null, tags: ["Harness"], publishedAt: date, createdAt: date }
  const related = { ...current, id: "related", tags: ["Agent、Harness"] }
  const unrelated = { ...current, id: "unrelated", tags: [] }
  assert.deepEqual(rankRelatedPosts(current, [current, unrelated, related, related], 3).map((post) => post.id), ["related"])
  assert.equal(relatedPostReason(current, related), "tags")
  assert.equal(selectPostRecommendations(current, [related, unrelated]).kind, "related")
  const fallback = selectPostRecommendations(current, [unrelated, unrelated, current])
  assert.equal(fallback.kind, "latest")
  assert.deepEqual(fallback.posts.map((post) => post.id), ["unrelated"])
  assert.deepEqual(selectPostRecommendations(current, []), { kind: "latest", posts: [] })
})

test("series overview and article use one explicit order and have labelled navigation", async () => {
  assert.deepEqual(seriesPostOrder[0], { seriesOrder: "asc" })
  const [overview, article] = await Promise.all([
    readFile(new URL("../app/[locale]/blog/series/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/blog/[slug]/page.tsx", import.meta.url), "utf8"),
  ])
  assert.match(overview, /orderBy: seriesPostOrder/)
  assert.match(article, /post\.seriesId \? seriesPostOrder/)
  assert.match(overview, /chapter=\{seriesDisplayPosition\(index\)\}/)
  assert.match(overview, /seriesEmpty/)
  assert.match(overview, /startSeries/)
  assert.match(article, /previousChronologicalPost/)
})

test("RSS categories use the same normalized public tags", () => {
  const xml = buildRssFeed({ title: "Feed", description: "Feed", siteUrl: "https://example.test/zh", feedUrl: "https://example.test/feed.xml", items: [{ title: "Post", description: "Text", url: "https://example.test/zh/blog/post", publishedAt: date, tags: ["Agent、Harness", "Agent"] }] })
  assert.match(xml, /<category>Agent<\/category>/)
  assert.match(xml, /<category>Harness<\/category>/)
  assert.equal((xml.match(/<category>/g) ?? []).length, 2)
})


test("card rendering escapes titles and snippets while exposing readable highlights", () => {
  const post = toBlogCard({ ...basePost, title: "<script>title</script>", content: "```html\n<script>body</script>\n```" }, "<script>")
  // next-intl requires children in this props type even when using createElement.
  // eslint-disable-next-line react/no-children-prop
  const markup = renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "zh", timeZone: "Asia/Shanghai", messages: zh, children: createElement(BlogCard, { post }),
  }))
  assert.doesNotMatch(markup, /<script>/)
  assert.match(markup, /&lt;script&gt;<\/mark>/)
  assert.match(markup, /正文匹配/)
})


test("database contains filters treat percent, underscore and backslash as literal query text", () => {
  assert.equal(literalContainsSearch("100%_done"), "100\\%\\_done")
  assert.equal(literalContainsSearch("a\\b"), "a\\\\b")
  assert.equal(literalContainsSearch("harness+skill 中文"), "harness+skill 中文")
})


test("tag normalization preserves technical and quoted comma syntax", () => {
  for (const tag of ["tuple<T, U>", "function(a,b)", "工具（调用，重试）", '"Hello, World"', "`a,b`", "map<K,V"]) {
    assert.deepEqual(normalizeTags([tag]), [tag])
  }
  assert.deepEqual(normalizeTags(["tuple<T, U>、Agent"]), ["tuple<T, U>", "Agent"])
  assert.deepEqual(splitTagTokens("Agent, Harness"), ["Agent", " Harness"])
})

test("public card renders a localized return context only when supplied by a filtered list", () => {
  const post = toBlogCard(basePost)
  // eslint-disable-next-line react/no-children-prop
  const render = (returnTo?: string) => renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: "zh", timeZone: "Asia/Shanghai", messages: zh, children: createElement(BlogCard, { post, returnTo }),
  }))
  const filtered = render("/blog?search=%E7%94%A8+AI&category=notes")
  const href = filtered.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&")
  assert.ok(href)
  const article = new URL(href, "https://example.test")
  assert.equal(article.pathname, "/zh/blog/article-a")
  assert.equal(article.searchParams.get("returnTo"), "/blog?search=%E7%94%A8+AI&category=notes")
  assert.match(render(), /href="\/zh\/blog\/article-a"/)
  assert.doesNotMatch(render(), /returnTo=/)
  assert.doesNotMatch(render("https://evil.test/blog?search=x"), /evil\.test|returnTo=/)
})
