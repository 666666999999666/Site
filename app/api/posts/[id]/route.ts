import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { updatePost } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError } from "@/lib/errors"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateEmptyObject, validatePostUpdate } from "@/lib/validation"
import { extractUploadUrls } from "@/lib/content"
import { deleteUploadFiles } from "@/lib/uploads-cleanup"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const post = await prisma.post.findUnique({ where: { id }, include: { category: true, series: true } })
    if (!post) throw new NotFoundError("未找到文章")
    return privateNoStore(NextResponse.json(post))
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const { id } = await params
    const input = validatePostUpdate(await readJsonObject(req))
    const post = await updatePost(id, input)
    return privateNoStore(NextResponse.json(post))
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    validateEmptyObject(await readJsonObject(req))
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
    return privateNoStore(NextResponse.json({ ok: true }))
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}
