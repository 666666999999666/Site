import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { mcpBearerCredential, mcpJson, mcpUploadToken } from "@/lib/mcp/http"
import { submitRemoteImportBundle } from "@/lib/mcp/import-staging-service"
import { authenticateStaticMcpContext } from "@/lib/mcp/auth-context"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = mcpBearerCredential(request)
    const principal = await authenticateStaticMcpContext(token)
    await runMcpMaintenance().catch((error) => console.error("[MCP maintenance failure]", error))
    const { id } = await context.params
    const result = await submitRemoteImportBundle({
      context: principal,
      uploadToken: mcpUploadToken(request),
      bundleId: id,
      config: loadMcpSecurityConfig(),
    })
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}
