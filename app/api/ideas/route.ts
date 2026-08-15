import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handleApiError } from "@/lib/api/handler"
import { readJsonObject } from "@/lib/validation"
import {
  createIdea,
  ideaCreateSchema,
  parseIdeaInput,
  parseIdeaSearchParams,
  searchIdeas,
} from "@/lib/ideas"

const privateHeaders = { "Cache-Control": "private, no-store" }

export async function GET(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    const filters = parseIdeaSearchParams(new URL(request.url).searchParams)
    const ideas = await searchIdeas(userId, filters)
    return NextResponse.json(ideas, { headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const input = parseIdeaInput(ideaCreateSchema, await readJsonObject(request))
    const idea = await createIdea(userId, input)
    return NextResponse.json(idea, { status: 201, headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}
