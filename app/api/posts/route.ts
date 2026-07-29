import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { calculateReadTime, generateUniqueSlug } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePostCreate } from "@/lib/validation"
import { normalizeContent } from "@/lib/content"
import { resolvePublishedAt } from "@/lib/post-policy"

export async function GET(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    const posts = await prisma.post.findMany({
      where: q ? {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ]
      } : undefined,
      orderBy: { createdAt: "desc" },
      include: { category: true },
    })
    return NextResponse.json(posts)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validatePostCreate(await readJsonObject(req))
    const status = input.status ?? "DRAFT"
    const content = normalizeContent(input.content)

    const post = await prisma.post.create({
      data: {
        title: input.title,
        content,
        excerpt: input.excerpt ?? null,
        slug: await generateUniqueSlug(input.title),
        categoryId: input.categoryId ?? null,
        tags: input.tags ?? [],
        status,
        readTime: calculateReadTime(content),
        publishedAt: resolvePublishedAt({
          nextStatus: status,
          requestedPublishedAt: input.publishedAt,
        }),
      },
    })
    return NextResponse.json(post, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
