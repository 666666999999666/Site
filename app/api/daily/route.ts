import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { getShanghaiDateKey } from "@/lib/daily-date"
import { getDailyDay } from "@/lib/daily"
import { parseDailyDateQuery } from "@/lib/daily-validation"

export async function GET(request: NextRequest) {
  try {
    const session = await ensureAuthenticated()
    const date = parseDailyDateQuery(request.nextUrl.searchParams.get("date"), getShanghaiDateKey())
    const response = NextResponse.json(await getDailyDay(session.userId, date))
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
