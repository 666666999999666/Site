import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { createQuestion, listQuestions } from "@/lib/questions/service"
import {
  parseQuestionInput,
  parseQuestionListQuery,
  questionCreateSchema,
} from "@/lib/questions/validation"

export async function GET(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    const query = parseQuestionListQuery(request.nextUrl.searchParams)
    return privateNoStore(NextResponse.json(await listQuestions(userId, query)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const input = parseQuestionInput(questionCreateSchema, await readJsonObject(request))
    return privateNoStore(NextResponse.json(
      await createQuestion(userId, input),
      { status: 201 }
    ))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
