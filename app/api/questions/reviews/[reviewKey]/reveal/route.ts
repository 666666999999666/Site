import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { revealQuestion } from "@/lib/questions/review-service"
import { parseQuestionInput, parseReviewKey, revealSchema } from "@/lib/questions/validation"

type RouteContext = { params: Promise<{ reviewKey: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { reviewKey: rawReviewKey } = await params
    const reviewKey = parseReviewKey(rawReviewKey)
    const input = parseQuestionInput(revealSchema, await readJsonObject(request))
    return privateNoStore(NextResponse.json(await revealQuestion(userId, reviewKey, input)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
