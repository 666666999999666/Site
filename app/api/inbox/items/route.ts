import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"
import { prisma } from "@/lib/db"
import { ConfigurationError } from "@/lib/errors"
import { isInboxEnabled } from "@/lib/inbox-feature"
import { InboxInputError } from "@/lib/inbox"
import { validateInboxCaptureBody, validateInboxListQuery } from "@/lib/inbox-request"
import { captureInboxItem } from "@/lib/inbox/service"
import { serializeInboxItem, serializeInboxSummary } from "@/lib/inbox-view"

function assertInboxEnabled() {
  if (!isInboxEnabled()) throw new ConfigurationError("智能收件箱尚未启用")
}

function inboxErrorResponse(error: unknown) {
  if (error instanceof InboxInputError) {
    return privateNoStore(NextResponse.json(
      { error: error.message, code: error.code },
      { status: 422 }
    ))
  }
  return privateNoStore(handleApiError(error))
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    assertInboxEnabled()
    const filters = validateInboxListQuery(new URL(request.url).searchParams)
    const items = await prisma.inboxItem.findMany({
      where: {
        ownerId: userId,
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        status: true,
        failureCode: true,
        failureMessage: true,
        createdAt: true,
        appliedAt: true,
        updatedAt: true,
        execution: true,
      },
    })
    return privateNoStore(NextResponse.json(items.map(serializeInboxSummary)))
  } catch (error) {
    return inboxErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    assertInboxEnabled()
    requireJsonRequest(request)
    const input = validateInboxCaptureBody(await request.json())
    const item = await captureInboxItem({ ownerId: userId, ...input })
    return privateNoStore(NextResponse.json(serializeInboxItem(item), { status: 201 }))
  } catch (error) {
    return inboxErrorResponse(error)
  }
}
