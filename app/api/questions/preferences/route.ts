import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { getQuestionPreference, updateQuestionPreference } from "@/lib/questions/queue"
import {
  parseQuestionInput,
  questionPreferencePatchSchema,
} from "@/lib/questions/validation"

export async function GET() {
  try {
    const { userId } = await ensureAuthenticated()
    return privateNoStore(NextResponse.json(await getQuestionPreference(userId)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const input = parseQuestionInput(
      questionPreferencePatchSchema,
      await readJsonObject(request)
    )
    return privateNoStore(NextResponse.json(
      await updateQuestionPreference(userId, input.dailyNewLimit)
    ))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
