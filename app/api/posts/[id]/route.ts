import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { calculateReadTime } from "@/lib/posts"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) return null
  return session
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAuth())) return NextResponse.json({ error: "未登录" }, { status: 401 })
  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id }, include: { category: true } })
  if (!post) return NextResponse.json({ error: "未找到" }, { status: 404 })
  return NextResponse.json(post)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAuth())) return NextResponse.json({ error: "未登录" }, { status: 401 })
  try {
    const { id } = await params
    const body = await req.json()
    const { title, content, excerpt, categoryId, tags, status } = body
    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title
    if (content !== undefined) { data.content = content; data.readTime = calculateReadTime(content) }
    if (excerpt !== undefined) data.excerpt = excerpt
    if (categoryId !== undefined) data.categoryId = categoryId || null
    if (tags !== undefined) data.tags = tags
    if (status !== undefined) data.status = status
    const post = await prisma.post.update({ where: { id }, data })
    return NextResponse.json(post)
  } catch (e) {
    console.error("[posts PUT]", e)
    return NextResponse.json({ error: "更新失败" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAuth())) return NextResponse.json({ error: "未登录" }, { status: 401 })
  try {
    const { id } = await params
    await prisma.post.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[posts DELETE]", e)
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }
}
