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
    const cats = await prisma.category.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] })
    return NextResponse.json(cats)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuth()
    const { name, type, description, color } = await req.json()
    if (!name || !type) throw new ValidationError("名称和类型必填")
    const cat = await prisma.category.create({ data: { name, type, description, color } })
    return NextResponse.json(cat, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
