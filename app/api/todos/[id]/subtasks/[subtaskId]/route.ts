import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { prisma } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import { readJsonObject, validateTodoSubtaskUpdate } from "@/lib/validation"

type RouteContext = { params: Promise<{ id: string; subtaskId: string }> }

async function requireSubtask(todoId: string, subtaskId: string) {
  const subtask = await prisma.todoSubtask.findFirst({
    where: { id: subtaskId, todoId },
    select: { id: true },
  })
  if (!subtask) throw new NotFoundError("子任务不存在")
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id, subtaskId } = await params
    const input = validateTodoSubtaskUpdate(await readJsonObject(request))
    await requireSubtask(id, subtaskId)
    const subtask = await prisma.todoSubtask.update({
      where: { id: subtaskId },
      data: input,
    })
    return privateNoStore(NextResponse.json(subtask))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id, subtaskId } = await params
    await requireSubtask(id, subtaskId)
    await prisma.todoSubtask.delete({ where: { id: subtaskId } })
    return privateNoStore(NextResponse.json({ ok: true }))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
