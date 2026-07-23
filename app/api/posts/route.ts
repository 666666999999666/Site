import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { calculateReadTime, generateSlug } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { AuthError, ValidationError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
  return session
}

export async function GET(req: NextRequest) {
  try {
    await ensureAuth()
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
    await ensureAuth()
    const body = await req.json()
    const { title, content, excerpt, categoryId, tags, status, publishedAt } = body

    if (typeof title !== "string" || !title.trim()) {
      throw new ValidationError("标题必填")
    }
    if (status !== undefined && !["DRAFT", "PUBLISHED"].includes(status)) {
      throw new ValidationError("status 只能是 DRAFT 或 PUBLISHED")
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      throw new ValidationError("tags 必须是数组")
    }

    const post = await prisma.post.create({
      data: {
        title,
        content: content || "",
        excerpt,
        slug: generateSlug(),
        categoryId: categoryId || null,
        tags: tags || [],
        status: status || "DRAFT",
        readTime: calculateReadTime(content || ""),
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      },
    })
    return NextResponse.json(post, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
