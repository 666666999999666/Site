import { mcpResourceUrl } from "@/lib/auth/oauth-config"

function oauthResourceError(description: string): Response {
  return Response.json(
    { error: "invalid_target", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  )
}

export async function validateOAuthMcpResource(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/$/, "")
  let resources: string[] | null = null

  if (request.method === "GET" && pathname === "/api/oauth/oauth2/authorize") {
    resources = url.searchParams.getAll("resource")
  } else if (request.method === "POST" && pathname === "/api/oauth/oauth2/token") {
    const body = new URLSearchParams(await request.clone().text())
    const grantType = body.get("grant_type")
    if (grantType === "authorization_code" || grantType === "refresh_token") {
      resources = body.getAll("resource")
    }
  }

  if (resources === null) return null
  if (resources.length !== 1 || resources[0] !== mcpResourceUrl()) {
    return oauthResourceError("resource 必须精确指向本站 MCP Resource")
  }
  return null
}
