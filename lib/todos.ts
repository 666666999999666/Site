import { normalizeContent } from "./content"
import { prisma } from "./db"
import { NotFoundError } from "./errors"
import { createPost } from "./posts"
import type { Prisma } from "./generated/prisma/client"

type TodoDatabase = typeof prisma | Prisma.TransactionClient

async function convertTodoToDraft(id: string, markDone: boolean, database: TodoDatabase) {
  const todo = await database.todo.findUnique({
    where: { id },
    include: { category: true },
  })
  if (!todo) throw new NotFoundError("Todo 不存在")

  const post = await createPost({
    title: todo.title,
    content: normalizeContent(todo.description ?? ""),
    excerpt: null,
    categoryId: null,
    tags: [],
    status: "DRAFT",
    publishedAt: null,
  }, database)

  const updatedTodo = markDone && todo.status !== "DONE"
    ? await database.todo.update({
        where: { id },
        data: { status: "DONE" },
        include: { category: true },
      })
    : todo

  return { post, todo: updatedTodo }
}

export async function todoToDraft(
  id: string,
  markDone = false,
  database?: Prisma.TransactionClient
) {
  if (database) return convertTodoToDraft(id, markDone, database)
  return prisma.$transaction((transaction) => convertTodoToDraft(id, markDone, transaction))
}

export async function getTodoForDraft(id: string) {
  const todo = await prisma.todo.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  })
  if (!todo) throw new NotFoundError("Todo 不存在")
  return todo
}
