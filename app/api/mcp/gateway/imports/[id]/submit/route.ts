import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { mcpBearerCredential, mcpJson, mcpUploadToken } from "@/lib/mcp/http"
import { submitRemoteImportBundle } from "@/lib/mcp/import-staging-service"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = mcpBearerCredential(request)
    const { id } = await context.params
    const result = await submitRemoteImportBundle({
      credentialToken: token,
      uploadToken: mcpUploadToken(request),
      bundleId: id,
      config: loadMcpSecurityConfig(token),
    })
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}
