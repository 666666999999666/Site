import { MCP_SCOPES } from "../mcp/scopes"
import { mcpResourceUrl, oauthIssuer } from "./oauth-config"

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    resource_name: "QZ Blog MCP",
    authorization_servers: [oauthIssuer()],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
  }
}

export function metadataResponse(value: Record<string, unknown>): Response {
  return Response.json(value, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
