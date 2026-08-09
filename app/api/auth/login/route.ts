import { NextRequest, NextResponse } from "next/server"
import { login } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"
import { readJsonObject, validateLogin } from "@/lib/validation"
import { validateOrigin } from "@/lib/csrf"
import { copyAuthSetCookies } from "@/lib/auth/response"

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req, { requireOrigin: true })) {
      return NextResponse.json({ error: "跨域请求被拒" }, { status: 403 })
    }
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.startsWith("application/json")) {
      return NextResponse.json({ error: "仅支持 application/json" }, { status: 415 })
    }
    const body = validateLogin(await readJsonObject(req))
    const ip = req.headers.get("x-real-ip")
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown"
    const result = await login(body.password, ip, req.headers)
    const response = NextResponse.json({ userId: result.userId, username: result.username })
    copyAuthSetCookies(result.response, response)
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (e) {
    return handleApiError(e)
  }
}
