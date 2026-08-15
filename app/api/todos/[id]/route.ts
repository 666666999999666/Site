import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"
import { ValidationError } from "@/lib/errors"
import { readJsonObject, validateTodoUpdate } from "@/lib/validation"
import { privateJsonHeaders, todoInclude } from "../_shared"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const { id } = await params
    const { subtasks, ...body } = validateTodoUpdate(await readJsonObject(req))

    if (subtasks) {
      const existingIds = new Set((await prisma.todoSubtask.findMany({
        where: { todoId: id },
        select: { id: true },
      })).map((subtask) => subtask.id))
      const unknownIds = subtasks
        .flatMap((subtask) => subtask.id ? [subtask.id] : [])
        .filter((subtaskId) => !existingIds.has(subtaskId))
      if (unknownIds.length > 0) throw new ValidationError("子任务不属于当前 Todo")
    }

    const retainedIds = subtasks?.flatMap((subtask) => subtask.id ? [subtask.id] : []) ?? []
    const todo = await prisma.todo.update({
      where: { id },
      data: {
        ...body,
        subtasks: subtasks ? {
          deleteMany: retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {},
          update: subtasks.flatMap((subtask, index) => subtask.id ? [{
            where: { id: subtask.id },
            data: {
              title: subtask.title,
              completed: subtask.completed ?? false,
              sortOrder: subtask.sortOrder ?? index,
            },
          }] : []),
          create: subtasks.flatMap((subtask, index) => subtask.id ? [] : [{
            title: subtask.title,
            completed: subtask.completed ?? false,
            sortOrder: subtask.sortOrder ?? index,
          }]),
        } : undefined,
      },
      include: todoInclude,
    })
    return NextResponse.json(todo, { headers: privateJsonHeaders })
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const { id } = await params
    await prisma.todo.delete({ where: { id } })
    return NextResponse.json({ ok: true }, { headers: privateJsonHeaders })
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}
