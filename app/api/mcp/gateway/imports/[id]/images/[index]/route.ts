import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { ValidationError } from "@/lib/errors"
import { mcpJson, mcpUploadToken } from "@/lib/mcp/http"
import { storeRemoteImportImage } from "@/lib/mcp/import-staging-service"
import { MAX_UPLOAD_BYTES } from "@/lib/uploads"

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> }
) {
  try {
    const contentLength = Number(request.headers.get("content-length"))
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      throw new ValidationError("MCP 导入图片必须提供有效 Content-Length")
    }
    if (contentLength > MAX_UPLOAD_BYTES) throw new ValidationError("MCP 导入图片不能超过 5MB")
    const { id, index: indexValue } = await context.params
    const index = Number(indexValue)
    if (!Number.isInteger(index)) throw new ValidationError("MCP 导入图片序号无效")
    const buffer = Buffer.from(await request.arrayBuffer())
    if (buffer.length > MAX_UPLOAD_BYTES) throw new ValidationError("MCP 导入图片不能超过 5MB")
    const result = await storeRemoteImportImage({
      bundleId: id,
      uploadToken: mcpUploadToken(request),
      index,
      buffer,
    })
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}
