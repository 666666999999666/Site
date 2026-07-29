import { NextRequest, NextResponse } from "next/server"
import { login } from "@/lib/auth/service"
import { handleApiError } from "@/lib/api/handler"
import { readJsonObject, validateLogin } from "@/lib/validation"

export async function POST(req: NextRequest) {
  try {
    const body = validateLogin(await readJsonObject(req))
    const ip = req.headers.get("x-real-ip")
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown"
    const result = await login(body.password, ip)
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
