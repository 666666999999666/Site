import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { readJsonObject, validateTodoCreate } from "@/lib/validation"
import { todoInclude } from "./_shared"

export async function GET() {
  try {
    await ensureAuthenticated()
    const todos = await prisma.todo.findMany({
      orderBy: [
        { priority: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      include: todoInclude,
    })
    return privateNoStore(NextResponse.json(todos))
  } catch (e) {
    return handlePrivateApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const input = validateTodoCreate(await readJsonObject(req))
    const subtasks = input.subtasks ?? []
    const todo = await prisma.todo.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        projectId: input.projectId ?? null,
        status: input.status ?? "TODO",
        priority: input.priority === undefined ? 0 : input.priority,
        dueDate: input.dueDate ?? null,
        completionCriteria: input.completionCriteria ?? null,
        subtasks: subtasks.length > 0 ? {
          create: subtasks.map((subtask, index) => ({
            ...(subtask.id ? { id: subtask.id } : {}),
            title: subtask.title,
            completed: subtask.completed ?? false,
            sortOrder: subtask.sortOrder ?? index,
          })),
        } : undefined,
      },
      include: todoInclude,
    })
    return privateNoStore(NextResponse.json(todo, { status: 201 }))
  } catch (e) {
    return handlePrivateApiError(e)
  }
}
