import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { calculateReadTime } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError } from "@/lib/errors"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePostUpdate } from "@/lib/validation"
import { extractUploadUrls, normalizeContent } from "@/lib/content"
import { deleteUploadFiles } from "@/lib/uploads-cleanup"
import { resolvePublishedAt } from "@/lib/post-policy"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
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
    await ensureAuthenticated()
    const { id } = await params
    const current = await prisma.post.findUnique({ where: { id } })
    if (!current) throw new NotFoundError("文章不存在")
    const input = validatePostUpdate(await readJsonObject(req))
    const nextStatus = input.status ?? current.status

    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = input.title
    if (input.content !== undefined) {
      const content = normalizeContent(input.content)
      data.content = content
      data.readTime = calculateReadTime(content)
    }
    if (input.excerpt !== undefined) data.excerpt = input.excerpt
    if (input.categoryId !== undefined) data.categoryId = input.categoryId
    if (input.tags !== undefined) data.tags = input.tags
    if (input.status !== undefined) data.status = input.status
    if (input.status !== undefined || input.publishedAt !== undefined) {
      data.publishedAt = resolvePublishedAt({
        existing: {
          status: current.status,
          publishedAt: current.publishedAt,
        },
        nextStatus,
        requestedPublishedAt: input.publishedAt,
      })
    }
    const post = await prisma.post.update({ where: { id }, data })
    return NextResponse.json(post)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    // #30: 先查询内容提取图片 URL，删除记录后清理关联文件（excludeId 防误删共享图片）
    const post = await prisma.post.findUnique({ where: { id }, select: { content: true } })
    await prisma.post.delete({ where: { id } })
    if (post) {
      await deleteUploadFiles(extractUploadUrls(post.content), id)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
