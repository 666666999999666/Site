import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { normalizeContent } from "@/lib/content"
import { prisma } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import { calculateReadTime, generateUniqueSlug } from "@/lib/posts"
import { readJsonObject, validateTodoDraft } from "@/lib/validation"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const { markDone } = validateTodoDraft(await readJsonObject(req))
    const todo = await prisma.todo.findUnique({
      where: { id },
      include: { category: true },
    })
    if (!todo) throw new NotFoundError("Todo 不存在")

    const content = normalizeContent(todo.description ?? "")
    const slug = await generateUniqueSlug(todo.title)
    const result = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: todo.title,
          content,
          excerpt: null,
          slug,
          categoryId: null,
          tags: [],
          status: "DRAFT",
          readTime: calculateReadTime(content),
          publishedAt: null,
        },
      })
      const updatedTodo = markDone && todo.status !== "DONE"
        ? await tx.todo.update({
            where: { id },
            data: { status: "DONE" },
            include: { category: true },
          })
        : todo

      return { post, todo: updatedTodo }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
