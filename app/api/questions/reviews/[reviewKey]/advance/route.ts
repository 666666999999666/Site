import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { advanceQuestion } from "@/lib/questions/review-service"
import { emptyObjectSchema, parseQuestionInput, parseReviewKey } from "@/lib/questions/validation"

type RouteContext = { params: Promise<{ reviewKey: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { reviewKey: rawReviewKey } = await params
    const reviewKey = parseReviewKey(rawReviewKey)
    parseQuestionInput(emptyObjectSchema, await readJsonObject(request))
    return privateNoStore(NextResponse.json(await advanceQuestion(userId, reviewKey)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
