import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { AuthError } from "@/lib/errors"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new AuthError("未登录")
}

export async function GET(req: NextRequest) {
  try {
    const keysParam = req.nextUrl.searchParams.get("keys")
    if (keysParam) {
      // 公开查询：只允许查询指定的安全 key
      const allowed = ["owner_name", "email", "home_tagline", "about_intro", "about_skills", "about_github"]
      const keys = keysParam.split(",").filter((k) => allowed.includes(k))
      const settings = await prisma.setting.findMany({ where: { key: { in: keys } } })
      const map: Record<string, string> = {}
      for (const s of settings) map[s.key] = s.value
      return NextResponse.json(map)
    }
    // 管理查询：需要认证，返回所有设置
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
