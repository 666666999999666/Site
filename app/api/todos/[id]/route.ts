import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateTodoUpdate } from "@/lib/validation"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const body = validateTodoUpdate(await readJsonObject(req))
    const todo = await prisma.todo.update({
      where: { id },
      data: body,
      include: { category: true },
    })
    return NextResponse.json(todo)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    await prisma.todo.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
