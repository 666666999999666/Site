import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { requireAdminMutationOrigin, requireJsonRequest } from "@/lib/api/admin-mutation"
import { deleteDailyQuote, updateDailyQuote } from "@/lib/daily"
import { parseDailyQuoteId, parseDailyQuoteUpdate } from "@/lib/daily-validation"
import { ValidationError } from "@/lib/errors"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id: rawId } = await context.params
    const quote = await updateDailyQuote(
      parseDailyQuoteId(rawId),
      parseDailyQuoteUpdate(await request.json())
    )
    return NextResponse.json(quote)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await ensureAuthenticated()
    requireAdminMutationOrigin(request)
    const { id: rawId } = await context.params
    const replacement = request.nextUrl.searchParams.get("replacementQuoteId")
    const replacementQuoteId = replacement === null ? null : Number(replacement)
    if (replacement !== null && (!Number.isSafeInteger(replacementQuoteId) || replacementQuoteId! <= 0)) {
      throw new ValidationError("替代提醒语 ID 无效")
    }
    return NextResponse.json(
      await deleteDailyQuote(parseDailyQuoteId(rawId), replacementQuoteId)
    )
  } catch (error) {
    return handleApiError(error)
  }
}
