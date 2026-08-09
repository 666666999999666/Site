import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import {
  isAllowedMcpOrigin,
  isProductionMcpHost,
  oauthSiteOrigin,
} from "@/lib/auth/oauth-config"
import { authenticateOAuthMcpRequest } from "@/lib/mcp/auth-context"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { MCP_SCOPES } from "@/lib/mcp/scopes"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"
import { createOnlineBlogMcpServer } from "@/mcp/online-tools"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store")
  return response
}

function resourceMetadataUrl(): string {
  return new URL("/.well-known/oauth-protected-resource/api/mcp", oauthSiteOrigin()).toString()
}

function unauthorized(response: Response): Response {
  response.headers.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${resourceMetadataUrl()}", error="invalid_token", scope="${MCP_SCOPES.join(" ")}"`
  )
  return noStore(response)
}

async function handleMcpRequest(request: NextRequest) {
  if (!isProductionMcpHost(request)) {
    return noStore(Response.json({ error: "invalid_host" }, { status: 421 }))
  }
  if (!isAllowedMcpOrigin(request)) {
    return noStore(Response.json({ error: "origin_not_allowed" }, { status: 403 }))
  }

  try {
    const context = await authenticateOAuthMcpRequest(request)
    await runMcpMaintenance().catch((maintenanceError) => {
      console.error("[MCP maintenance failure]", maintenanceError)
    })
    const server = createOnlineBlogMcpServer(context, loadMcpSecurityConfig())
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return noStore(await transport.handleRequest(request))
  } catch (error) {
    const response = handleApiError(error)
    if (response.status === 401) return unauthorized(response)
    return noStore(response)
  }
}

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
