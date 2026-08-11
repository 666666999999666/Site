import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { getShanghaiMonthKey } from "@/lib/daily-date"
import { getDailyHistory } from "@/lib/daily"
import { parseDailyMonthQuery } from "@/lib/daily-validation"

export async function GET(request: NextRequest) {
  try {
    const session = await ensureAuthenticated()
    const month = parseDailyMonthQuery(
      request.nextUrl.searchParams.get("month"),
      getShanghaiMonthKey()
    )
    const response = NextResponse.json(await getDailyHistory(session.userId, month))
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
