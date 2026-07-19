import { NextRequest, NextResponse } from "next/server"
import { login } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
    const result = await login(body.username, body.password, ip)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
