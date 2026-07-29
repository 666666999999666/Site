import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateProjectUpdate } from "@/lib/validation"

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
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
