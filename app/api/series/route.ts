import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handleApiError } from "@/lib/api/handler"
import { privateNoStore } from "@/lib/api/private-response"
import { createSeries } from "@/lib/series"
import { readJsonObject, validateSeriesCreate } from "@/lib/validation"

export async function GET() {
  try {
    await ensureAuthenticated()
    const series = await prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] })
    return privateNoStore(NextResponse.json(series))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const series = await createSeries(validateSeriesCreate(await readJsonObject(request)))
    return privateNoStore(NextResponse.json(series, { status: 201 }))
  } catch (error) {
    return privateNoStore(handleApiError(error))
  }
}
