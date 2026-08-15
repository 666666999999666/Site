import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"
import { handleApiError } from "@/lib/api/handler"
import { prisma } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import { readJsonObject, validateTodoSubtaskCreate } from "@/lib/validation"
import { privateJsonHeaders } from "../../_shared"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const todo = await prisma.todo.findUnique({ where: { id }, select: { id: true } })
    if (!todo) throw new NotFoundError("Todo 不存在")

    const subtasks = await prisma.todoSubtask.findMany({
      where: { todoId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(subtasks, { headers: privateJsonHeaders })
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const input = validateTodoSubtaskCreate(await readJsonObject(request))
    const todo = await prisma.todo.findUnique({ where: { id }, select: { id: true } })
    if (!todo) throw new NotFoundError("Todo 不存在")

    const lastSubtask = input.sortOrder === undefined
      ? await prisma.todoSubtask.findFirst({
          where: { todoId: id },
          orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
          select: { sortOrder: true },
        })
      : null
    const subtask = await prisma.todoSubtask.create({
      data: {
        todoId: id,
        title: input.title,
        completed: input.completed ?? false,
        sortOrder: input.sortOrder ?? ((lastSubtask?.sortOrder ?? -1) + 1),
      },
    })
    return NextResponse.json(subtask, { status: 201, headers: privateJsonHeaders })
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
