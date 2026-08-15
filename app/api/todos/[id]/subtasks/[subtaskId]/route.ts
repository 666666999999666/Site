import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"
import { handleApiError } from "@/lib/api/handler"
import { prisma } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import { readJsonObject, validateTodoSubtaskUpdate } from "@/lib/validation"
import { privateJsonHeaders } from "../../../_shared"

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
    return NextResponse.json(subtask, { headers: privateJsonHeaders })
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id, subtaskId } = await params
    await requireSubtask(id, subtaskId)
    await prisma.todoSubtask.delete({ where: { id: subtaskId } })
    return NextResponse.json({ ok: true }, { headers: privateJsonHeaders })
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
