import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { authenticateStaticMcpContext } from "@/lib/mcp/auth-context"
import { mcpBearerCredential, mcpJson } from "@/lib/mcp/http"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export async function GET(request: NextRequest) {
  try {
    const token = mcpBearerCredential(request)
    const credential = await authenticateStaticMcpContext(token)
    loadMcpSecurityConfig()
    await runMcpMaintenance().catch((error) => {
      console.error("[MCP maintenance failure]", error)
    })
    return mcpJson({
      ok: true,
      credential: {
        id: credential.credentialId,
        name: credential.clientName,
        scopes: credential.scopes,
      },
      transport: "local_markdown_import",
      tools: ["create_draft_from_markdown"],
      remote_mcp_endpoint: "/api/mcp",
    })
  } catch (error) {
    return handleApiError(error)
  }
}
