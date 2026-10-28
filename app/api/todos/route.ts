import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { readJsonObject, validateTodoCreate } from "@/lib/validation"
import { todoIncludeForOwner } from "./_shared"
import { TODO_STATUSES } from "@/lib/todos-policy"
import { ValidationError } from "@/lib/errors"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    const status = req.nextUrl.searchParams.get("status")
    const q = req.nextUrl.searchParams.get("q")?.trim()
    if (status && !TODO_STATUSES.some((value) => value === status)) throw new ValidationError("Todo 状态无效")
    if (q && q.length > 300) throw new ValidationError("搜索词不能超过 300 个字符")
    const todos = await prisma.todo.findMany({
      where: {
        ...(status ? { status: status as typeof TODO_STATUSES[number] } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
      },
      orderBy: [
        { priority: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      include: todoIncludeForOwner(userId),
    })
    return privateNoStore(NextResponse.json(todos))
  } catch (e) {
    return handlePrivateApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
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
        statusReason: input.statusReason ?? null,
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
      include: todoIncludeForOwner(userId),
    })
    return privateNoStore(NextResponse.json(todo, { status: 201 }))
  } catch (e) {
    return handlePrivateApiError(e)
  }
}
