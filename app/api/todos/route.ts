import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { AuthError, ValidationError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
}

export async function GET() {
  try {
    await ensureAuth()
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
    await ensureAuth()
    const { title, description, categoryId } = await req.json()
    if (!title) throw new ValidationError("标题必填")
    const todo = await prisma.todo.create({
      data: { title, description, categoryId: categoryId || null },
    })
    return NextResponse.json(todo, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
