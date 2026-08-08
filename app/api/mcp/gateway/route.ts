import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { authenticateMcpCredential } from "@/lib/mcp/credential-service"
import { mcpBearerCredential, mcpJson } from "@/lib/mcp/http"
import { cleanupExpiredImportBundles } from "@/lib/mcp/import-staging-service"
import { cleanupMcpRateLimits } from "@/lib/mcp/rate-limit-service"

export async function GET(request: NextRequest) {
  try {
    const token = mcpBearerCredential(request)
    const credential = await authenticateMcpCredential(token)
    loadMcpSecurityConfig(token)
    await Promise.all([
      cleanupExpiredImportBundles().catch((error) => {
        console.error("[MCP staging cleanup failure]", error)
      }),
      cleanupMcpRateLimits().catch((error) => {
        console.error("[MCP rate-limit cleanup failure]", error)
      }),
    ])
    return mcpJson({
      ok: true,
      credential: { id: credential.id, name: credential.name, scopes: credential.scopes },
      tools: [
        "create_draft_from_markdown",
        "search_drafts",
        "update_draft_metadata",
        "create_category",
        "todo_to_draft",
      ],
    })
  } catch (error) {
    return handleApiError(error)
  }
}
