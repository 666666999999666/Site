import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { mcpBearerCredential, mcpJson, requireJsonContentType } from "@/lib/mcp/http"
import { createRemoteImportBundle } from "@/lib/mcp/import-staging-service"
import { authenticateStaticMcpContext } from "@/lib/mcp/auth-context"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export async function POST(request: NextRequest) {
  try {
    requireJsonContentType(request)
    const token = mcpBearerCredential(request)
    const context = await authenticateStaticMcpContext(token)
    await runMcpMaintenance().catch((error) => console.error("[MCP maintenance failure]", error))
    const result = await createRemoteImportBundle({
      context,
      config: loadMcpSecurityConfig(),
      value: await request.json(),
    })
    return mcpJson(result, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
