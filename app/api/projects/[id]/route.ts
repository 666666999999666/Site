import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateProjectUpdate } from "@/lib/validation"
import { deleteUploadFiles } from "@/lib/uploads-cleanup"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const input = validateProjectUpdate(await readJsonObject(req))
    const project = await prisma.project.update({ where: { id }, data: input })
    return NextResponse.json(project)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    // #30: 先查询 coverImage，删除记录后清理关联文件（Project 表不传 excludeId）
    const project = await prisma.project.findUnique({ where: { id }, select: { coverImage: true } })
    await prisma.project.delete({ where: { id } })
    if (project?.coverImage) {
      await deleteUploadFiles([project.coverImage])
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
