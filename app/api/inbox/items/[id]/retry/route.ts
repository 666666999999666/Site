import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"
import { ConfigurationError } from "@/lib/errors"
import { isInboxEnabled } from "@/lib/inbox-feature"
import { validateInboxRetryBody } from "@/lib/inbox-request"
import { retryInboxItem } from "@/lib/inbox/service"
import { serializeInboxItem } from "@/lib/inbox-view"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await ensureAuthenticated()
    if (!isInboxEnabled()) throw new ConfigurationError("智能收件箱尚未启用")
    requireJsonRequest(request)
    validateInboxRetryBody(await request.json())
    const { id } = await params
    const item = await retryInboxItem(userId, id)
    return privateNoStore(NextResponse.json(serializeInboxItem(item)))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
