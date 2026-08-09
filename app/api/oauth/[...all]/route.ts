import { toNextJsHandler } from "better-auth/next-js"
import { z } from "zod"
import { auth } from "@/lib/auth/better-auth"
import { mcpResourceUrl } from "@/lib/auth/oauth-config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const handlers = toNextJsHandler(auth)
const MAX_DCR_BODY_BYTES = 32 * 1024

const dcrGuardSchema = z.object({
  client_name: z.string().min(1).max(80).optional(),
  redirect_uris: z.array(z.string().min(1).max(2048)).min(1).max(10),
  post_logout_redirect_uris: z.array(z.string().min(1).max(2048)).max(10).optional(),
  contacts: z.array(z.string().min(1).max(254)).max(10).optional(),
  scope: z.string().max(512).optional(),
  token_endpoint_auth_method: z.literal("none").optional(),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .max(2)
    .optional(),
  response_types: z.array(z.literal("code")).min(1).max(1).optional(),
  subject_type: z.literal("public").optional(),
  require_pkce: z.literal(true).optional(),
  type: z.enum(["native", "user-agent-based"]).optional(),
  client_uri: z.string().max(2048).optional(),
  logo_uri: z.string().max(2048).optional(),
  tos_uri: z.string().max(2048).optional(),
  policy_uri: z.string().max(2048).optional(),
  software_id: z.string().max(255).optional(),
  software_version: z.string().max(255).optional(),
  software_statement: z.string().max(8192).optional(),
}).passthrough()

function denyDirectPasswordLogin(request: Request): Response | null {
  const pathname = new URL(request.url).pathname.replace(/\/$/, "")
  if (pathname === "/api/oauth/sign-in/email") {
    return Response.json({ error: "not_found" }, { status: 404 })
  }
  return null
}

function oauthResourceError(description: string): Response {
  return Response.json(
    { error: "invalid_target", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  )
}

function oauthClientMetadataError(description: string): Response {
  return Response.json(
    { error: "invalid_client_metadata", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  )
}

async function validateDynamicClientRegistration(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  if (request.method !== "POST" || url.pathname.replace(/\/$/, "") !== "/api/oauth/oauth2/register") {
    return null
  }
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return oauthClientMetadataError("DCR 只接受 application/json")
  }
  const text = await request.clone().text()
  if (Buffer.byteLength(text, "utf8") > MAX_DCR_BODY_BYTES) {
    return oauthClientMetadataError("DCR metadata 不能超过 32KB")
  }
  try {
    const parsed = dcrGuardSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      return oauthClientMetadataError(parsed.error.issues[0]?.message ?? "DCR metadata 无效")
    }
    if (parsed.data.grant_types && !parsed.data.grant_types.includes("authorization_code")) {
      return oauthClientMetadataError("DCR Client 必须使用 authorization_code")
    }
  } catch {
    return oauthClientMetadataError("DCR metadata 必须是有效 JSON")
  }
  return null
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

function wrap(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const denied = denyDirectPasswordLogin(request)
    if (denied) return denied
    const registrationError = await validateDynamicClientRegistration(request)
    if (registrationError) return registrationError
    const resourceError = await validateOAuthMcpResource(request)
    return resourceError ?? handler(request)
  }
}

export const GET = wrap(handlers.GET)
export const POST = wrap(handlers.POST)
export const PATCH = wrap(handlers.PATCH)
export const PUT = wrap(handlers.PUT)
export const DELETE = wrap(handlers.DELETE)
