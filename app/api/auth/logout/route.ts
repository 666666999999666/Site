import { NextRequest, NextResponse } from "next/server"
import { logout } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"
import { copyAuthSetCookies } from "@/lib/auth/response"

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: "跨域请求被拒" }, { status: 403 })
    }
    const authResponse = await logout(req.headers)
    const response = NextResponse.json({ ok: true })
    copyAuthSetCookies(authResponse, response)
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (e) {
    return handleApiError(e)
  }
}
