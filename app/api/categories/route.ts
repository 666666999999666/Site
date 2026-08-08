import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createCategory } from "@/lib/categories"
import { handleApiError } from "@/lib/api/handler"
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
    const cat = await createCategory(input)
    return NextResponse.json(cat, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
