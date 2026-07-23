import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { calculateReadTime, generateSlug } from "@/lib/posts"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) return null
  return session
}

export async function GET(req: NextRequest) {
  if (!(await ensureAuth())) return NextResponse.json({ error: "未登录" }, { status: 401 })
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
}

export async function POST(req: NextRequest) {
  if (!(await ensureAuth())) return NextResponse.json({ error: "未登录" }, { status: 401 })
  try {
    const body = await req.json()
    const { title, content, excerpt, categoryId, tags, status, publishedAt } = body as {
      title: string; content: string; excerpt?: string; categoryId?: string; tags?: string[]; status: "DRAFT" | "PUBLISHED"; publishedAt?: string
    }
    if (!title) return NextResponse.json({ error: "标题必填" }, { status: 400 })
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
    console.error("[posts POST]", e)
    return NextResponse.json({ error: "创建失败" }, { status: 500 })
  }
}
