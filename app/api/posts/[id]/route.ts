import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { updatePost } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError } from "@/lib/errors"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePostUpdate } from "@/lib/validation"
import { extractUploadUrls } from "@/lib/content"
import { deleteUploadFiles } from "@/lib/uploads-cleanup"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const post = await prisma.post.findUnique({ where: { id }, include: { category: true } })
    if (!post) throw new NotFoundError("未找到文章")
    return NextResponse.json(post)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const input = validatePostUpdate(await readJsonObject(req))
    const post = await updatePost(id, input)
    return NextResponse.json(post)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const post = await prisma.post.findUnique({
      where: { id },
      select: { content: true, coverImage: true },
    })
    await prisma.post.delete({ where: { id } })
    if (post) {
      const urls = new Set(extractUploadUrls(post.content))
      if (post.coverImage) urls.add(post.coverImage)
      await deleteUploadFiles([...urls], id)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
