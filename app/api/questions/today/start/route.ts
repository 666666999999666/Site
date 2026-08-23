import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { startToday } from "@/lib/questions/queue"
import { emptyObjectSchema, parseQuestionInput } from "@/lib/questions/validation"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    parseQuestionInput(emptyObjectSchema, await readJsonObject(request))
    return privateNoStore(NextResponse.json(await startToday(userId)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
