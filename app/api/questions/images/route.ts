import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireAdminMutationOrigin } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { createQuestionImage } from "@/lib/questions/image-service"
import { readQuestionImageUpload } from "@/lib/questions/image-upload"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireAdminMutationOrigin(request)
    const file = await readQuestionImageUpload(request)

    return privateNoStore(NextResponse.json(
      await createQuestionImage(userId, file),
      { status: 201 }
    ))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
