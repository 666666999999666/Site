import { NextResponse } from "next/server"
import { logout } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"

export async function POST() {
  try {
    await logout()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
