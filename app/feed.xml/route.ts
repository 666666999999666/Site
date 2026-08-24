import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { extractPlainText } from "@/lib/content"
import { buildRssFeed } from "@/lib/rss"
import { absoluteUrl } from "@/lib/site"
import { getPublicSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [posts, settings] = await Promise.all([
      prisma.post.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: {
          title: true,
          slug: true,
          excerpt: true,
          content: true,
          tags: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      getPublicSettings(),
    ])
    const xml = buildRssFeed({
      title: `${settings.owner_name} 的博客`,
      description: "Agent 应用、Python 与 Web 工程实践记录。",
      siteUrl: absoluteUrl("/zh/blog"),
      feedUrl: absoluteUrl("/feed.xml"),
      items: posts.map((post) => ({
        title: post.title,
        url: absoluteUrl(`/zh/blog/${post.slug}`),
        description: post.excerpt || extractPlainText(post.content).slice(0, 300),
        publishedAt: post.publishedAt ?? post.createdAt,
        tags: post.tags,
      })),
    })

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error("[RssFeedUnavailable]", error)
    return new NextResponse("RSS feed is temporarily unavailable", { status: 503 })
  }
}
