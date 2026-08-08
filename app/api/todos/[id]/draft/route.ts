import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { todoToDraft } from "@/lib/todos"
import { readJsonObject, validateTodoDraft } from "@/lib/validation"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    const { id } = await params
    const { markDone } = validateTodoDraft(await readJsonObject(req))
    const result = await todoToDraft(id, markDone)

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
