import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ConflictError } from "@/lib/errors"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateCategoryCreate } from "@/lib/validation"

export async function GET() {
  try {
    await ensureAuthenticated()
    const cats = await prisma.category.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] })
    return NextResponse.json(cats)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validateCategoryCreate(await readJsonObject(req))
    const duplicate = await prisma.category.findFirst({
      where: {
        type: input.type,
        name: { equals: input.name, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (duplicate) throw new ConflictError("同类型下已存在同名分区")

    const cat = await prisma.category.create({ data: input })
    return NextResponse.json(cat, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
