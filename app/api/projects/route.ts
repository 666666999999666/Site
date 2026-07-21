import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { AuthError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
}

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
    await ensureAuth()
    const body = await req.json()
    const { title, description, tags, sourceUrl, demoUrl } = body as {
      title: string
      description?: string
      tags?: string[]
      sourceUrl?: string
      demoUrl?: string
    }
    if (!title) throw new Error("标题必填")
    const project = await prisma.project.create({
      data: {
        title,
        description: description || null,
        tags: tags || [],
        sourceUrl: sourceUrl || null,
        demoUrl: demoUrl || null,
      },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
