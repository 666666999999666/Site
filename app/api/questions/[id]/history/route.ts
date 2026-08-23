import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { getQuestionHistory } from "@/lib/questions/service"
import { parseHistoryQuery } from "@/lib/questions/validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    const { id } = await params
    const { page } = parseHistoryQuery(request.nextUrl.searchParams)
    return privateNoStore(NextResponse.json(await getQuestionHistory(userId, id, page)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
