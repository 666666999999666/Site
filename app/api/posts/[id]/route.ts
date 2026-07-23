import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { calculateReadTime } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { AuthError, ValidationError, NotFoundError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
  return session
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    const post = await prisma.post.findUnique({ where: { id }, include: { category: true } })
    if (!post) throw new NotFoundError("未找到")
    return NextResponse.json(post)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    const body = await req.json()
    const { title, content, excerpt, categoryId, tags, status, publishedAt } = body

    if (status !== undefined && !["DRAFT", "PUBLISHED"].includes(status)) {
      throw new ValidationError("status 只能是 DRAFT 或 PUBLISHED")
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      throw new ValidationError("tags 必须是数组")
    }

    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title
    if (content !== undefined) { data.content = content; data.readTime = calculateReadTime(content) }
    if (excerpt !== undefined) data.excerpt = excerpt
    if (categoryId !== undefined) data.categoryId = categoryId || null
    if (tags !== undefined) data.tags = tags
    if (status !== undefined) data.status = status
    if (publishedAt !== undefined) data.publishedAt = publishedAt ? new Date(publishedAt) : null
    const post = await prisma.post.update({ where: { id }, data })
    return NextResponse.json(post)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    await prisma.post.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
