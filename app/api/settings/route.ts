import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import {
  PUBLIC_SETTING_KEYS,
  readJsonObject,
  validateSettings,
} from "@/lib/validation"

export async function GET(req: NextRequest) {
  try {
    const keysParam = req.nextUrl.searchParams.get("keys")
    if (keysParam) {
      // 公开查询：只允许查询指定的安全 key
      const keys = keysParam.split(",").filter((key) => (
        PUBLIC_SETTING_KEYS.includes(key as typeof PUBLIC_SETTING_KEYS[number])
      ))
      const settings = await prisma.setting.findMany({ where: { key: { in: keys } } })
      const map: Record<string, string> = {}
      for (const s of settings) map[s.key] = s.value
      return NextResponse.json(map)
    }
    // 管理查询：需要认证，返回所有设置
    await ensureAuthenticated()
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
    await ensureAuthenticated()
    const body = validateSettings(await readJsonObject(req))
    await prisma.$transaction(
      Object.entries(body).map(([key, value]) => prisma.setting.upsert({
        where: { key },
        update: { value: value ?? "" },
        create: { key, value: value ?? "" },
      }))
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
