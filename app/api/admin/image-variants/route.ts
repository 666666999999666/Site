import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { createHistoricalImageBackfill } from "@/lib/historical-image-backfill"
import { ValidationError } from "@/lib/errors"
import { uploadDirectory } from "@/lib/uploads"

export const runtime = "nodejs"
const backfill = createHistoricalImageBackfill({ directory: uploadDirectory })

async function readExecutionBody(request: NextRequest): Promise<unknown> {
  const limit = 4096
  if (Number(request.headers.get("content-length")) > limit) throw new ValidationError("图片补齐请求过大")
  const reader = request.body?.getReader()
  if (!reader) throw new ValidationError("请求体必须是有效 JSON")
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.length
      if (bytes > limit) {
        await reader.cancel()
        throw new ValidationError("图片补齐请求过大")
      }
      chunks.push(item.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } finally { reader.releaseLock() }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    if (request.nextUrl.search) throw new ValidationError("图片预览不接受路径、URL 或其他参数")
    return privateNoStore(NextResponse.json(await backfill.preview(userId)))
  } catch (error) { return handlePrivateApiError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await ensureAuthenticated()
    requireJsonRequest(request)
    if (request.nextUrl.search) throw new ValidationError("图片补齐不接受查询参数")
    return privateNoStore(NextResponse.json(await backfill.execute(userId, await readExecutionBody(request))))
  } catch (error) { return handlePrivateApiError(error) }
}
