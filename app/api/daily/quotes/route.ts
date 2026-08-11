import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { createDailyQuote, listDailyQuotes } from "@/lib/daily"
import {
  parseDailyQuoteCreate,
  parseQuoteListQuery,
} from "@/lib/daily-validation"

export async function GET(request: NextRequest) {
  try {
    await ensureAuthenticated()
    const response = NextResponse.json(
      await listDailyQuotes(parseQuoteListQuery(request.nextUrl.searchParams))
    )
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const quote = await createDailyQuote(parseDailyQuoteCreate(await request.json()))
    return NextResponse.json(quote, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
