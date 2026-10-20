import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { convertIdea } from "@/lib/ideas"
import { ideaConversionSchema, parseIdeaInput } from "@/lib/ideas-validation"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const input = parseIdeaInput(ideaConversionSchema, await readJsonObject(request))
    const result = await convertIdea(userId, id, input)
    return privateNoStore(NextResponse.json(result, { status: 201 }))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
