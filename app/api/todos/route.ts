import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateTodoCreate } from "@/lib/validation"

export async function GET() {
  try {
    await ensureAuthenticated()
    const todos = await prisma.todo.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { category: true },
    })
    return NextResponse.json(todos)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validateTodoCreate(await readJsonObject(req))
    const todo = await prisma.todo.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        status: input.status ?? "TODO",
        priority: input.priority ?? 0,
        dueDate: input.dueDate ?? null,
      },
      include: { category: true },
    })
    return NextResponse.json(todo, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
