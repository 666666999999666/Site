import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { getReadableQuestionImage } from "@/lib/questions/image-service"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = await ensureAuthenticated()
    const { id } = await params
    const image = await getReadableQuestionImage(userId, id)
    return privateNoStore(new NextResponse(new Uint8Array(image.body), {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(image.byteSize),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    }))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
