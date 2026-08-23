import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { getQuestionDetail, updateQuestion } from "@/lib/questions/service"
import { parseQuestionInput, questionPatchSchema } from "@/lib/questions/validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    const { id } = await params
    return privateNoStore(NextResponse.json(await getQuestionDetail(userId, id)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const input = parseQuestionInput(questionPatchSchema, await readJsonObject(request))
    return privateNoStore(NextResponse.json(await updateQuestion(userId, id, input)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
