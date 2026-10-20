import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import {
  ideaCreateSchema,
  parseIdeaInput,
  parseIdeaSearchParams,
} from "@/lib/ideas-validation"
import { createIdea, searchIdeas } from "@/lib/ideas"

export async function GET(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    const filters = parseIdeaSearchParams(new URL(request.url).searchParams)
    const ideas = await searchIdeas(userId, filters)
    return privateNoStore(NextResponse.json(ideas))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const input = parseIdeaInput(ideaCreateSchema, await readJsonObject(request))
    const idea = await createIdea(userId, input)
    return privateNoStore(NextResponse.json(idea, { status: 201 }))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
