import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handleApiError } from "@/lib/api/handler"
import { readJsonObject } from "@/lib/validation"
import {
  deleteIdea,
  emptyObjectSchema,
  getIdea,
  ideaUpdateSchema,
  parseIdeaInput,
  updateIdea,
} from "@/lib/ideas"

const privateHeaders = { "Cache-Control": "private, no-store" }

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    const { id } = await params
    const idea = await getIdea(userId, id)
    return NextResponse.json(idea, { headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const input = parseIdeaInput(ideaUpdateSchema, await readJsonObject(request))
    const idea = await updateIdea(userId, id, input)
    return NextResponse.json(idea, { headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    parseIdeaInput(emptyObjectSchema, await readJsonObject(request))
    const { id } = await params
    const result = await deleteIdea(userId, id)
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}
