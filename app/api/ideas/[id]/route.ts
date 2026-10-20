import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import {
  emptyObjectSchema,
  ideaUpdateSchema,
  parseIdeaInput,
} from "@/lib/ideas-validation"
import { deleteIdea, getIdea, updateIdea } from "@/lib/ideas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    const { id } = await params
    const idea = await getIdea(userId, id)
    return privateNoStore(NextResponse.json(idea))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const input = parseIdeaInput(ideaUpdateSchema, await readJsonObject(request))
    const idea = await updateIdea(userId, id, input)
    return privateNoStore(NextResponse.json(idea))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    parseIdeaInput(emptyObjectSchema, await readJsonObject(request))
    const { id } = await params
    const result = await deleteIdea(userId, id)
    return privateNoStore(NextResponse.json(result))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
