import assert from "node:assert/strict"
import test from "node:test"
import { publicPageMetadata } from "../lib/public-metadata"
import { absoluteUrl } from "../lib/site"
import { loadPublicMetadataRoute } from "./helpers/public-route"
import zh from "../messages/zh.json"

function expectedMetadata(title: string, description: string, pathname: string, openGraph = {}) {
  return {
    title, description,
    alternates: { types: { "application/rss+xml": "/feed.xml" }, canonical: pathname },
    openGraph: { title, description, url: pathname, locale: "zh_CN", ...openGraph },
  }
}

test("public metadata constructor preserves child RSS and explicit Open Graph overrides", () => {
  assert.deepEqual(publicPageMetadata({ title: "Title", description: "Description", pathname: "/zh" }), expectedMetadata("Title", "Description", "/zh"))
  const overrides = { type: "article" as const, title: "OG title", description: "OG description", url: "https://example.test/article", images: ["https://example.test/cover.png"] }
  assert.deepEqual(publicPageMetadata({ title: "Title", description: "Description", pathname: "/zh/article", openGraph: overrides }), expectedMetadata("Title", "Description", "/zh/article", overrides))
})

test("all four translated route metadata outputs retain relative OG URLs and child RSS", async () => {
  for (const [file, namespace, pathname] of [
    ["app/[locale]/page.tsx", "home", "/zh"],
    ["app/[locale]/about/page.tsx", "about", "/zh/about"],
    ["app/[locale]/projects/page.tsx", "projects", "/zh/projects"],
    ["app/[locale]/blog/page.tsx", "blog", "/zh/blog"],
  ] as const) {
    const route = loadPublicMetadataRoute(file)
    assert.deepEqual(await route.generateMetadata!({ params: Promise.resolve({ locale: "zh" }) }), expectedMetadata(zh[namespace].metadataTitle, zh[namespace].metadataDescription, pathname), file)
  }
})

test("archive, tags and series metadata preserve exact descriptions and absolute OG URLs", async () => {
  const archive = "/zh/blog/archive"
  assert.deepEqual(loadPublicMetadataRoute("app/[locale]/blog/archive/page.tsx").metadata,
    expectedMetadata("博客归档", "按发布时间浏览历史文章。", archive, { url: absoluteUrl(archive) }))
  const tags = "/zh/blog/tags"
  assert.deepEqual(loadPublicMetadataRoute("app/[locale]/blog/tags/page.tsx").metadata,
    expectedMetadata("博客标签", "按标签查找 Agent、Python 与 Web 工程文章。", tags, { description: "按标签查找技术文章。", url: absoluteUrl(tags) }))
  const series = "/zh/blog/series"
  assert.deepEqual(await loadPublicMetadataRoute("app/[locale]/blog/series/page.tsx").generateMetadata!({ params: Promise.resolve({}) }),
    expectedMetadata("博客系列", "按主题连续阅读 Agent、Python 与 Web 工程文章。", series, { url: absoluteUrl(series) }))
})

test("tag route metadata decodes once and preserves canonical encoding and RSS", async () => {
  for (const tag of ["Agent、Workflow", "a/b #?", "invalid%escape"]) {
    const pathname = `/zh/blog/tags/${encodeURIComponent(tag)}`
    assert.deepEqual(await loadPublicMetadataRoute("app/[locale]/blog/tags/[tag]/page.tsx").generateMetadata!({ params: Promise.resolve({ tag: encodeURIComponent(tag) }) }),
      expectedMetadata(`#${tag}`, `标签“${tag}”下的博客文章。`, pathname, { url: absoluteUrl(pathname) }))
  }
})

test("series metadata preserves optional cover, fallback description and missing behavior", async () => {
  let current: { slug: string; title: string; description: string | null; coverImage: string | null } | null = null
  const route = loadPublicMetadataRoute("app/[locale]/blog/series/[slug]/page.tsx", {
    series: { findUnique: async (query: { where: { slug: string }; include: { posts: { where: { status: string } } } }) => {
      assert.equal(query.where.slug, "工程")
      assert.equal(query.include.posts.where.status, "PUBLISHED")
      return current
    } },
  })
  const input = { params: Promise.resolve({ slug: encodeURIComponent("工程") }) }
  assert.deepEqual(await route.generateMetadata!(input), {})
  for (const coverImage of [null, "/uploads/series.png", "https://example.test/cover.png"]) {
    current = { slug: "工程", title: "工程系列", description: coverImage ? "明确说明" : null, coverImage }
    const pathname = "/zh/blog/series/工程"
    assert.deepEqual(await route.generateMetadata!(input), expectedMetadata("工程系列", current.description || "“工程系列”系列文章目录。", pathname, {
      url: absoluteUrl(pathname), ...(coverImage ? { images: [absoluteUrl(coverImage)] } : {}),
    }))
  }
})

test("article metadata hides drafts and missing posts and retains exact article OG fields", async () => {
  const base = {
    slug: "工程", title: "工程文章", excerpt: "明确摘要", content: "不应泄露的正文", status: "PUBLISHED",
    publishedAt: new Date("2026-10-01T08:00:00Z") as Date | null,
    updatedAt: new Date("2026-10-02T08:00:00Z"), tags: ["Agent、Workflow", "Agent"], coverImage: null as string | null,
  }
  let current: typeof base | null = null
  const route = loadPublicMetadataRoute("app/[locale]/blog/[slug]/page.tsx", {
    post: { findUnique: async (query: { where: { slug: string } }) => {
      assert.equal(query.where.slug, "工程")
      return current
    } },
  })
  const input = { params: Promise.resolve({ slug: encodeURIComponent("工程") }) }
  assert.deepEqual(await route.generateMetadata!(input), {})
  current = { ...base, status: "DRAFT" }
  assert.deepEqual(await route.generateMetadata!(input), {})
  for (const coverImage of [null, "/uploads/article.png", "https://example.test/article.png"]) {
    for (const publishedAt of [base.publishedAt, null]) {
      current = { ...base, coverImage, publishedAt }
      const pathname = "/zh/blog/工程"
      assert.deepEqual(await route.generateMetadata!(input), expectedMetadata("工程文章", "明确摘要", pathname, {
        type: "article", url: absoluteUrl(pathname), publishedTime: publishedAt?.toISOString(), modifiedTime: base.updatedAt.toISOString(), tags: ["Agent", "Workflow"],
        images: coverImage
          ? [{ url: absoluteUrl(coverImage), alt: "工程文章 文章封面" }]
          : [{ url: absoluteUrl("/og-default.png"), alt: "QZ Site：Agent 应用、Python 与 Web 工程实践", width: 1200, height: 630 }],
      }))
    }
  }
})
