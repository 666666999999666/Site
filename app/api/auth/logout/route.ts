import { NextRequest, NextResponse } from "next/server"
import { logout } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: "跨域请求被拒" }, { status: 403 })
    }
    await logout()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
