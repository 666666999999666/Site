import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireAdminMutationOrigin, requireJsonRequest } from "@/lib/api/admin-mutation"
import { handleApiError } from "@/lib/api/handler"
import { privateNoStore } from "@/lib/api/private-response"
import { deleteSeries, updateSeries } from "@/lib/series"
import { readJsonObject, validateSeriesUpdate } from "@/lib/validation"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const { id } = await params
    const series = await updateSeries(id, validateSeriesUpdate(await readJsonObject(request)))
    return privateNoStore(NextResponse.json(series))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    requireAdminMutationOrigin(request)
    const { id } = await params
    return privateNoStore(NextResponse.json(await deleteSeries(id)))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
