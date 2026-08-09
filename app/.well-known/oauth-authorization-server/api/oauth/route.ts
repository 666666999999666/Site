import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/lib/auth/better-auth"

export const dynamic = "force-dynamic"

const metadata = oauthProviderAuthServerMetadata(auth)

export async function GET(request: Request) {
  const response = await metadata(request)
  const body = await response.json() as Record<string, unknown>
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "public, max-age=300")
  headers.set("Content-Type", "application/json; charset=utf-8")
  return Response.json({
    ...body,
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
  }, {
    status: response.status,
    headers,
  })
}
