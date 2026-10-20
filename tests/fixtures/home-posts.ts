import type { Category, Post, Series } from "../../lib/generated/prisma/client"

export const homePostFixture = {
  id: "home-one",
  slug: "home-one",
  title: "首页原始摘要 <script>",
  excerpt: "  **保留原始 Markdown**\n<script>摘要原文</script>  ",
  content: "home-body-private-marker" + "很长的首页文章正文。".repeat(8_000),
  contentFormat: "DIAGRAM",
  readHint: "这条阅读提示不用于首页",
  categoryId: "category-internal-marker",
  category: { id: "category-internal-marker", name: "工程", type: "BLOG", description: "category-description-private-marker", color: "#C97B3D", sortOrder: 0, createdAt: new Date("2026-09-01T00:00:00Z") },
  seriesId: "series-internal-marker",
  series: { id: "series-internal-marker", title: "系列", slug: "series-slug-private-marker", description: "series-description-private-marker", coverImage: null, sortOrder: 0, createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-02T00:00:00Z") },
  seriesOrder: 1,
  tags: ["tag-private-marker"],
  coverImage: "/uploads/cover-private-marker.png",
  draftMetadata: { note: "draft-private-marker" },
  sourceInboxItemId: "inbox-private-marker",
  status: "PUBLISHED",
  readTime: 9,
  publishedAt: new Date("2026-10-01T16:30:00Z"),
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-10-03T00:00:00Z"),
} satisfies Post & { category: Category | null; series: Series | null }

export const homePostRenderingFixtures = [
  homePostFixture,
  { ...homePostFixture, id: "home-two", slug: "home-two", title: "无摘要", excerpt: null, category: null, series: null, publishedAt: null, readTime: 1 },
  { ...homePostFixture, id: "home-three", slug: "home-three", title: "空摘要和分类名", excerpt: "", category: { ...homePostFixture.category, name: "" }, series: null, publishedAt: new Date("2026-12-31T16:00:00Z"), readTime: 0 },
]
