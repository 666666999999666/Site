import { NextRequest, NextResponse } from "next/server"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { privateNoStore } from "@/lib/api/private-response"
import { prisma } from "@/lib/db"
import { ConfigurationError, NotFoundError } from "@/lib/errors"
import { isInboxEnabled } from "@/lib/inbox-feature"
import { validateInboxDeleteBody } from "@/lib/inbox-request"
import { deleteInboxItem } from "@/lib/inbox/service"
import { serializeInboxItem } from "@/lib/inbox-view"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await ensureAuthenticated()
    if (!isInboxEnabled()) throw new ConfigurationError("智能收件箱尚未启用")
    const { id } = await params
    const item = await prisma.inboxItem.findFirst({
      where: { id, ownerId: userId },
      include: {
        execution: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!item) throw new NotFoundError("收件箱记录不存在")

    return privateNoStore(NextResponse.json(serializeInboxItem(item)))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await ensureAuthenticated()
    if (!isInboxEnabled()) throw new ConfigurationError("智能收件箱尚未启用")
    requireJsonRequest(request)
    validateInboxDeleteBody(await request.json())
    const { id } = await params
    await deleteInboxItem(userId, id)
    return privateNoStore(NextResponse.json({ success: true }))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
