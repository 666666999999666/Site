import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { publicBlogListHref, publicBlogPostHref, safePublicBlogReturnHref } from "../lib/public-blog-navigation"

test("public search and category survive opening an article and its explicit return link", () => {
  const filters = { search: " 用 AI + & 中文 ", category: "category-a" }
  const list = publicBlogListHref(filters)
  const article = new URL(publicBlogPostHref("中文 / ? # 文章", list), "https://example.test")
  assert.equal(article.pathname, "/blog/" + encodeURIComponent("中文 / ? # 文章"))
  const returned = safePublicBlogReturnHref(article.searchParams.get("returnTo"))
  assert.equal(returned, list)
  const params = new URL(returned, "https://example.test").searchParams
  assert.equal(params.get("search"), filters.search.trim())
  assert.equal(params.get("category"), filters.category)
})

test("category-only and search-only contexts are retained; empty filters use clean URLs", () => {
  for (const filters of [{ search: "用 AI" }, { category: "notes" }]) {
    const list = publicBlogListHref(filters)
    assert.equal(new URL(publicBlogPostHref("post", list), "https://example.test").searchParams.get("returnTo"), list)
  }
  assert.equal(publicBlogListHref({ search: "  ", category: "" }), "/blog")
  assert.equal(publicBlogPostHref("direct"), "/blog/direct")
  assert.equal(publicBlogPostHref("home", "/blog"), "/blog/home")
  assert.equal(safePublicBlogReturnHref(undefined), "/blog")
})

test("return links reject external, private, cross-locale and malformed targets", () => {
  for (const value of [
    undefined, null, [], ["/blog?search=x"], "https://evil.test/blog?search=x", "//evil.test/blog",
    "javascript:alert(1)", "/admin/posts?search=x", "/en/blog?search=x", "/zh/blog?search=x",
    "/blog/post?search=x", "/blog/../admin?search=x", "/blog\\..\\admin?search=x",
    "/blog%2f..%2fadmin?search=x", "blog?search=x", "/blog?search=" + "x".repeat(8192),
  ]) assert.equal(safePublicBlogReturnHref(value), "/blog", String(value))
})

test("return context keeps only public list filters and drops nested redirects/hash/unknown fields", () => {
  assert.equal(
    safePublicBlogReturnHref("/blog?search=%E7%94%A8+AI&category=notes&returnTo=https://evil.test&unknown=x#private"),
    publicBlogListHref({ search: "用 AI", category: "notes" }),
  )
  assert.equal(safePublicBlogReturnHref("/blog?search=first&search=second"), "/blog?search=first")
})

test("article-to-article navigation can carry the original list without nesting return URLs", () => {
  const list = publicBlogListHref({ search: "AI", category: "notes" })
  const first = new URL(publicBlogPostHref("first", list), "https://example.test")
  const second = new URL(publicBlogPostHref("second", safePublicBlogReturnHref(first.searchParams.get("returnTo"))), first)
  assert.equal(second.searchParams.get("returnTo"), list)
  assert.equal(new URL(second.searchParams.get("returnTo")!, first).searchParams.has("returnTo"), false)
})

test("production list/card/detail wiring carries context without history.back or browser storage", () => {
  const list = readFileSync("app/[locale]/blog/page.tsx", "utf8")
  const card = readFileSync("components/blog/BlogCard.tsx", "utf8")
  const detail = readFileSync("app/[locale]/blog/[slug]/page.tsx", "utf8")
  assert.match(list, /publicBlogListHref\(\{ category, search \}\)/)
  assert.match(list, /<BlogCard[^\n]+returnTo=\{returnTo\}/)
  assert.match(card, /href=\{publicBlogPostHref\(post.slug, returnTo\)\}/)
  assert.match(detail, /safePublicBlogReturnHref\(\(await searchParams\).returnTo\)/)
  assert.match(detail, /<Link href=\{returnTo\} className="mb-6/)
  for (const name of ["item", "previous", "next"]) assert.ok(detail.includes(`publicBlogPostHref(${name}.slug, returnTo)`))
  assert.match(detail, /<BlogCard post=\{item\} returnTo=\{returnTo\}/)
  assert.doesNotMatch(detail, /history\.back|router\.back|sessionStorage|localStorage/)
  // Metadata/canonical remains the clean article URL, not the return context.
  assert.ok(detail.includes('const pathname = `/zh/blog/${post.slug}`'))
})
