import type { MetadataRoute } from "next"
import { prisma } from "@/lib/db"
import { absoluteUrl } from "@/lib/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = ["", "/blog", "/projects", "/about"].map(
    (pathname) => ({
      url: absoluteUrl(`/zh${pathname}`),
      changeFrequency: pathname === "/blog" ? "weekly" : "monthly",
      priority: pathname === "" ? 1 : 0.7,
    })
  )

  try {
    const posts = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    return [
      ...staticPages,
      ...posts.map((post) => ({
        url: absoluteUrl(`/zh/blog/${post.slug}`),
        lastModified: post.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
    ]
  } catch (error) {
    console.error("[SitemapDatabaseUnavailable]", error)
    return staticPages
  }
}
