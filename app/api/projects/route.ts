import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validateProjectCreate } from "@/lib/validation"

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { sortOrder: "asc" },
    })
    return NextResponse.json(projects)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validateProjectCreate(await readJsonObject(req))
    const project = await prisma.project.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        tags: input.tags ?? [],
        coverImage: input.coverImage ?? null,
        sourceUrl: input.sourceUrl ?? null,
        demoUrl: input.demoUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
