import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { AuthError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    const body = await req.json()
    const { title, description, tags, sourceUrl, demoUrl } = body as {
      title?: string
      description?: string
      tags?: string[]
      sourceUrl?: string
      demoUrl?: string
    }
    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description || null
    if (tags !== undefined) data.tags = tags
    if (sourceUrl !== undefined) data.sourceUrl = sourceUrl || null
    if (demoUrl !== undefined) data.demoUrl = demoUrl || null
    const project = await prisma.project.update({ where: { id }, data })
    return NextResponse.json(project)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
