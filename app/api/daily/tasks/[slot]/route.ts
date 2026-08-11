import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { requireAdminMutationOrigin, requireJsonRequest } from "@/lib/api/admin-mutation"
import { deleteDailyTask, getDailyStats, saveDailyTask } from "@/lib/daily"
import { getShanghaiDateKey } from "@/lib/daily-date"
import {
  parseDailyDateQuery,
  parseDailySlot,
  parseDailyTaskInput,
} from "@/lib/daily-validation"

type RouteContext = { params: Promise<{ slot: string }> }

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await ensureAuthenticated()
    requireJsonRequest(request)
    const { slot: rawSlot } = await context.params
    const slot = parseDailySlot(rawSlot)
    const input = parseDailyTaskInput(await request.json())
    const day = await saveDailyTask(session.userId, slot, input)
    const response = NextResponse.json({ day, stats: await getDailyStats(session.userId) })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await ensureAuthenticated()
    requireAdminMutationOrigin(request)
    const { slot: rawSlot } = await context.params
    const slot = parseDailySlot(rawSlot)
    const date = parseDailyDateQuery(request.nextUrl.searchParams.get("date"), getShanghaiDateKey())
    const day = await deleteDailyTask(session.userId, slot, date)
    const response = NextResponse.json({ day, stats: await getDailyStats(session.userId) })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
