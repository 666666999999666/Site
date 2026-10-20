import type { MetadataRoute } from "next"
import { prisma } from "@/lib/db"
import { absoluteUrl } from "@/lib/site"
import { normalizeTags } from "@/lib/tags"

// Database-backed URLs must be resolved at request time, never from the build-safe empty client.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/blog",
    "/blog/series",
    "/blog/tags",
    "/blog/archive",
    "/projects",
    "/about",
  ].map(
    (pathname) => ({
      url: absoluteUrl(`/zh${pathname}`),
      changeFrequency: pathname === "/blog" ? "weekly" : "monthly",
      priority: pathname === "" ? 1 : 0.7,
    })
  )

  try {
    const [posts, series] = await Promise.all([
      prisma.post.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, tags: true, updatedAt: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.series.findMany({
        where: { posts: { some: { status: "PUBLISHED" } } },
        select: { slug: true, updatedAt: true, posts: { where: { status: "PUBLISHED" }, select: { updatedAt: true } } },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
    ])
    const tags = normalizeTags(posts.flatMap((post) => post.tags))
    return [
      ...staticPages,
      ...posts.map((post) => ({
        url: absoluteUrl(`/zh/blog/${post.slug}`),
        lastModified: post.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
      ...series.map((item) => ({
        url: absoluteUrl(`/zh/blog/series/${item.slug}`),
        lastModified: new Date(Math.max(item.updatedAt.getTime(), ...item.posts.map((post) => post.updatedAt.getTime()))),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...tags.map((tag) => ({
        url: absoluteUrl(`/zh/blog/tags/${encodeURIComponent(tag)}`),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ]
  } catch (error) {
    console.error("[SitemapDatabaseUnavailable]", error)
    return staticPages
  }
}
