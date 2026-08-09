import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/better-auth"
import { changeAdminPassword } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePasswordChange } from "@/lib/validation"
import { copyAuthSetCookies } from "@/lib/auth/response"
import { validateOrigin } from "@/lib/csrf"

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req, { requireOrigin: true })) {
      return NextResponse.json({ error: "跨域请求被拒" }, { status: 403 })
    }
    const session = await ensureAuthenticated()

    const { currentPassword, newPassword } = validatePasswordChange(
      await readJsonObject(req)
    )

    await changeAdminPassword({
      userId: session.userId,
      currentPassword,
      newPassword,
    })

    const authResponse = await auth.api.signOut({ headers: req.headers, asResponse: true })
    const response = NextResponse.json({ ok: true, loggedOut: true })
    copyAuthSetCookies(authResponse, response)
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (e) {
    return handleApiError(e)
  }
}
