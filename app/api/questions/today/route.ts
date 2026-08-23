import { NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { getTodayView } from "@/lib/questions/queue"

export async function GET() {
  try {
    const { userId } = await ensureAuthenticated()
    return privateNoStore(NextResponse.json(await getTodayView(userId)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
