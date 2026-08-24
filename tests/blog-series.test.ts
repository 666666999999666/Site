import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { Prisma } from "../lib/generated/prisma/client"
import { handleApiError } from "../lib/api/handler"
import { nextSeriesOrderFromMax, seriesDisplayPosition } from "../lib/series-order"
import { buildRssFeed } from "../lib/rss"
import { isRetiredEnglishPath } from "../lib/locale-routing"
import { validateSeriesCreate } from "../lib/validation"
import { rankRelatedPosts } from "../lib/related-posts"
import { detachPostsAndDeleteSeries } from "../lib/series-deletion"
import { hasPublicProjectEvidence } from "../lib/public-projects"
import { articleOpenGraphImage, DEFAULT_OG_IMAGE } from "../lib/open-graph"
import { requireBlogSeriesTestDatabaseUrl } from "./blog-series-test-database"

test("series validation accepts managed fields and rejects unsafe values", () => {
  assert.deepEqual(validateSeriesCreate({
    title: " Agent 工程 ",
    slug: "agent-engineering",
    description: " 连续学习记录 ",
    coverImage: "/uploads/series.webp",
    sortOrder: -2,
  }), {
    title: "Agent 工程",
    slug: "agent-engineering",
    description: "连续学习记录",
    coverImage: "/uploads/series.webp",
    sortOrder: -2,
  })
  assert.throws(() => validateSeriesCreate({ title: "系列", description: "简介", slug: "bad--slug" }), /slug/)
  assert.throws(() => validateSeriesCreate({ title: "系列", description: "   " }), /系列简介(必须是字符串|必填)/)
  assert.throws(() => validateSeriesCreate({ title: "系列" }), /系列简介(必须是字符串|必填)/)
  assert.throws(() => validateSeriesCreate({ title: "系列", description: "简介", coverImage: "https://example.com/x" }), /路径无效/)
  assert.throws(() => validateSeriesCreate({ title: "系列", description: "简介", sortOrder: 10_001 }), /-10000 到 10000/)
})

test("automatic series order advances instead of reusing zero", () => {
  assert.equal(nextSeriesOrderFromMax(null), 0)
  assert.equal(nextSeriesOrderFromMax(0), 1)
  assert.equal(nextSeriesOrderFromMax(41), 42)
  assert.throws(() => nextSeriesOrderFromMax(10_000), /达到上限/)
  assert.equal(seriesDisplayPosition(0), 1)
  assert.equal(seriesDisplayPosition(4), 5)
  assert.throws(() => seriesDisplayPosition(-1), /显示位置无效/)
})

test("migration declares the unique order key and SetNull disaster fallback", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20260824010000_blog_series/migration.sql", import.meta.url), "utf8"),
  ])
  assert.match(schema, /@@unique\(\[seriesId, seriesOrder\]\)/)
  assert.match(schema, /description String\s*\n/)
  assert.match(migration, /CREATE UNIQUE INDEX "Post_seriesId_seriesOrder_key"/)
  assert.match(migration, /"description" TEXT NOT NULL/)
  assert.match(migration, /ON DELETE SET NULL ON UPDATE CASCADE/)
  assert.doesNotMatch(migration, /DELETE FROM "Post"/)
})

test("series deletion transaction retains posts and clears both relation fields", async () => {
  const posts: Array<{ id: string; seriesId: string | null; seriesOrder: number | null }> = [
    { id: "a", seriesId: "series-1", seriesOrder: 0 },
    { id: "b", seriesId: "series-1", seriesOrder: 1 },
    { id: "c", seriesId: "series-2", seriesOrder: 0 },
  ]
  let seriesExists = true
  const count = await detachPostsAndDeleteSeries({
    post: {
      async updateMany({ where, data }) {
        let updated = 0
        for (const post of posts) {
          if (post.seriesId !== where.seriesId) continue
          post.seriesId = data.seriesId
          post.seriesOrder = data.seriesOrder
          updated += 1
        }
        return { count: updated }
      },
    },
    series: {
      async delete({ where }) {
        assert.equal(where.id, "series-1")
        seriesExists = false
      },
    },
  }, "series-1")

  assert.equal(count, 2)
  assert.equal(seriesExists, false)
  assert.equal(posts.length, 3)
  assert.deepEqual(posts.slice(0, 2).map((post) => [post.seriesId, post.seriesOrder]), [
    [null, null],
    [null, null],
  ])
  assert.deepEqual(posts[2], { id: "c", seriesId: "series-2", seriesOrder: 0 })
})

test("related posts rank same series before category and tags, then deduplicate", () => {
  const date = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`)
  const current = {
    id: "current",
    seriesId: "series-1",
    categoryId: "category-1",
    tags: ["Agent", "Python"],
    publishedAt: date(10),
    createdAt: date(10),
  }
  const sameSeries = { ...current, id: "series", categoryId: "other", tags: [], publishedAt: date(1), createdAt: date(1) }
  const sameCategory = { ...current, id: "category", seriesId: null, tags: [], publishedAt: date(20), createdAt: date(20) }
  const sharedTags = { ...current, id: "tags", seriesId: null, categoryId: null, tags: ["Agent", "Python"], publishedAt: date(24), createdAt: date(24) }
  const unrelated = { ...current, id: "unrelated", seriesId: null, categoryId: null, tags: [], publishedAt: date(25), createdAt: date(25) }

  assert.deepEqual(
    rankRelatedPosts(current, [unrelated, sharedTags, sameCategory, sameSeries, sameSeries], 4)
      .map((post) => post.id),
    ["series", "category", "tags", "unrelated"]
  )
})

test("public project cards require description plus evidence", async () => {
  const base = { title: "MiniClaude", description: "名词描述", tags: [], sourceUrl: null, demoUrl: null }
  assert.equal(hasPublicProjectEvidence(base), false)
  assert.equal(hasPublicProjectEvidence({ ...base, tags: ["Python"] }), false)
  assert.equal(hasPublicProjectEvidence({ ...base, sourceUrl: "https://example.test/source" }), true)
  assert.equal(hasPublicProjectEvidence({ ...base, sourceUrl: "javascript:alert(1)" }), false)
  assert.equal(hasPublicProjectEvidence({ ...base, description: "  ", tags: ["Python"] }), false)

  const [home, projects] = await Promise.all([
    readFile(new URL("../app/[locale]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/projects/page.tsx", import.meta.url), "utf8"),
  ])
  assert.match(home, /\.filter\(hasPublicProjectEvidence\)[\s\S]*?\.slice\(0, 1\)/)
  assert.match(projects, /\.filter\(hasPublicProjectEvidence\)/)
})

test("articles use a stable Chinese default Open Graph image", () => {
  assert.deepEqual(articleOpenGraphImage("无封面文章", null), DEFAULT_OG_IMAGE)
  assert.deepEqual(articleOpenGraphImage("有封面文章", "/uploads/post.webp"), {
    path: "/uploads/post.webp",
    alt: "有封面文章 文章封面",
  })
  assert.equal(DEFAULT_OG_IMAGE.width, 1200)
  assert.equal(DEFAULT_OG_IMAGE.height, 630)
  assert.match(DEFAULT_OG_IMAGE.alt, /Agent.*Python.*Web/)
})

test("Blog Series integration URL guard rejects production-like targets", () => {
  assert.equal(
    requireBlogSeriesTestDatabaseUrl("postgresql://localhost/site_test?schema=blog_series_test_ci").schema,
    "blog_series_test_ci"
  )
  assert.throws(
    () => requireBlogSeriesTestDatabaseUrl("postgresql://db.liaoqizai.site/site_test?schema=blog_series_test_ci"),
    /production-looking/
  )
  assert.throws(
    () => requireBlogSeriesTestDatabaseUrl("postgresql://localhost/site?schema=public"),
    /disposable test database/
  )
})

test("a concurrent duplicate series order is returned as an HTTP conflict", async () => {
  const error = new Prisma.PrismaClientKnownRequestError("duplicate series order", {
    code: "P2002",
    clientVersion: "7.9.1",
    meta: { target: ["seriesId", "seriesOrder"] },
  })
  const response = handleApiError(error)
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), {
    error: "数据已存在，请勿重复提交",
    code: "CONFLICT",
  })
})

test("RSS escapes untrusted text and publishes only supplied Chinese URLs", () => {
  const xml = buildRssFeed({
    title: "QZ & 博客",
    description: "<工程记录>",
    siteUrl: "https://example.com/zh/blog",
    feedUrl: "https://example.com/feed.xml",
    items: [{
      title: "A < B",
      url: "https://example.com/zh/blog/a",
      description: "内容 & 摘要",
      publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      tags: ["Agent & Python"],
    }],
  })
  assert.match(xml, /QZ &amp; 博客/)
  assert.match(xml, /A &lt; B/)
  assert.match(xml, /\/zh\/blog\/a/)
  assert.doesNotMatch(xml, /\/en\//)
})

test("only the retired English route segment is recognized", async () => {
  assert.equal(isRetiredEnglishPath("/en"), true)
  assert.equal(isRetiredEnglishPath("/en/"), true)
  assert.equal(isRetiredEnglishPath("/en/blog/a"), true)
  assert.equal(isRetiredEnglishPath("/energy"), false)
  assert.equal(isRetiredEnglishPath("/english"), false)

  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8")
  assert.match(proxy, /isRetiredEnglishPath\(pathname\)/)
  assert.match(proxy, /status:\s*410/)
  assert.match(proxy, /["']Content-Type["']:\s*["']text\/plain; charset=utf-8["']/)
  assert.match(proxy, /["']X-Robots-Tag["']:\s*["']noindex["']/)
  assert.match(proxy, /["']Cache-Control["']:\s*["']no-store["']/)
  assert.doesNotMatch(proxy, /NextResponse\.redirect\([^\n]*english/i)
})
