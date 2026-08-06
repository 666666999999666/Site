import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateCategoryUpdate } from "@/lib/validation"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const current = await prisma.category.findUnique({ where: { id } })
    if (!current) throw new NotFoundError("分区不存在")
    const body = validateCategoryUpdate(await readJsonObject(req))
    if (body.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          id: { not: id },
          type: current.type,
          name: { equals: body.name, mode: "insensitive" },
        },
        select: { id: true },
      })
      if (duplicate) throw new ConflictError("同类型下已存在同名分区")
    }
    const cat = await prisma.category.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(cat)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthenticated()
    const { id } = await params

    // #27: 删除前检查关联的 Post/Todo，避免 schema onDelete:SetNull 静默清空分类
    const [postCount, todoCount] = await Promise.all([
      prisma.post.count({ where: { categoryId: id } }),
      prisma.todo.count({ where: { categoryId: id } }),
    ])
    if (postCount > 0 || todoCount > 0) {
      throw new ConflictError(
        `无法删除：仍有 ${postCount} 篇文章和 ${todoCount} 个 Todo 关联此分类`,
      )
    }

    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
