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
    await ensureAuth()
    const settings = await prisma.setting.findMany()
    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return NextResponse.json(map)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureAuth()
    const body = (await req.json()) as Record<string, string>
    for (const [key, value] of Object.entries(body)) {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
