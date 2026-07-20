import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { AuthError, NotFoundError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    const body = await req.json()
    const todo = await prisma.todo.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId || null }),
        ...(body.priority !== undefined && { priority: body.priority }),
      },
    })
    return NextResponse.json(todo)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuth()
    const { id } = await params
    await prisma.todo.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
