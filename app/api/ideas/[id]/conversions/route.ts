import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handleApiError } from "@/lib/api/handler"
import { readJsonObject } from "@/lib/validation"
import { convertIdea, ideaConversionSchema, parseIdeaInput } from "@/lib/ideas"

const privateHeaders = { "Cache-Control": "private, no-store" }

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
    return NextResponse.json(result, { status: 201, headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}
