import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore, handlePrivateApiError } from "@/lib/api/private-response"
import { todoToDraft } from "@/lib/todos"
import { readJsonObject, validateTodoDraft } from "@/lib/validation"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const { id } = await params
    const { markDone } = validateTodoDraft(await readJsonObject(req))
    const result = await todoToDraft(id, markDone)

    return privateNoStore(NextResponse.json(result, { status: 201 }))
  } catch (e) {
    return handlePrivateApiError(e)
  }
}
