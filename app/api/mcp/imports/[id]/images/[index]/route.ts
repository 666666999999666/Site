import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { isAllowedMcpOrigin, isProductionMcpHost } from "@/lib/auth/oauth-config"
import { ValidationError } from "@/lib/errors"
import { mcpJson, mcpUploadToken } from "@/lib/mcp/http"
import { storeRemoteImportImage } from "@/lib/mcp/import-staging-service"
import { MAX_UPLOAD_BYTES } from "@/lib/uploads"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> }
) {
  try {
    if (!isProductionMcpHost(request)) {
      return mcpJson({ error: "invalid_host" }, { status: 421 })
    }
    if (!isAllowedMcpOrigin(request)) {
      return mcpJson({ error: "origin_not_allowed" }, { status: 403 })
    }
    if (request.headers.get("content-type")?.toLowerCase() !== "application/octet-stream") {
      throw new ValidationError("MCP 导入图片必须使用 application/octet-stream")
    }
    const contentLength = Number(request.headers.get("content-length"))
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      throw new ValidationError("MCP 导入图片必须提供有效 Content-Length")
    }
    if (contentLength > MAX_UPLOAD_BYTES) throw new ValidationError("MCP 导入图片不能超过 5MB")
    const uploadToken = mcpUploadToken(request)
    const { id, index: indexValue } = await context.params
    const index = Number(indexValue)
    if (!Number.isInteger(index)) throw new ValidationError("MCP 导入图片序号无效")
    const result = await storeRemoteImportImage({
      bundleId: id,
      uploadToken,
      index,
      declaredSize: contentLength,
      readBuffer: async () => Buffer.from(await request.arrayBuffer()),
    })
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}
