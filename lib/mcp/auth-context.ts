import { verifyAccessToken } from "better-auth/oauth2"
import { AuthError } from "../errors"
import { prisma } from "../db"
import {
  mcpResourceUrl,
  oauthIssuer,
  oauthJwksUrl,
} from "../auth/oauth-config"
import { MCP_SCOPES, type McpScope } from "./scopes"
import {
  ensureOAuthMcpCredential,
} from "./credential-service"

export interface McpAuthenticatedContext {
  credentialId: string
  clientName: string
  authType: "oauth" | "static"
  scopes: McpScope[]
  subject: string
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "")
  if (!match) throw new AuthError("缺少 OAuth Bearer Access Token")
  if (match[1].startsWith("qzmcp_v1_")) {
    throw new AuthError("固定 MCP credential 不能用于远程 /api/mcp")
  }
  return match[1]
}

function tokenScopes(value: unknown): McpScope[] {
  if (typeof value !== "string") throw new AuthError("OAuth Access Token 缺少 scope")
  const requested = [...new Set(value.split(/\s+/).filter(Boolean))]
  const unknown = requested.filter((scope) => scope !== "offline_access"
    && !MCP_SCOPES.includes(scope as McpScope))
  if (unknown.length > 0) throw new AuthError("OAuth Access Token 包含未知 scope")
  const scopes = requested.filter((scope): scope is McpScope => MCP_SCOPES.includes(scope as McpScope))
  if (scopes.length === 0) throw new AuthError("OAuth Access Token 未授予 MCP scope")
  return scopes
}

export async function authenticateOAuthMcpRequest(request: Request): Promise<McpAuthenticatedContext> {
  const token = bearerToken(request)
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>
  try {
    payload = await verifyAccessToken(token, {
      jwksUrl: oauthJwksUrl(),
      verifyOptions: {
        issuer: oauthIssuer(),
        audience: mcpResourceUrl(),
        algorithms: ["ES256"],
        clockTolerance: 5,
      },
    })
  } catch {
    throw new AuthError("OAuth Access Token 无效或已过期")
  }

  const subject = typeof payload.sub === "string" ? payload.sub : ""
  const clientId = typeof payload.azp === "string" ? payload.azp : ""
  const sessionId = typeof payload.sid === "string" ? payload.sid : ""
  if (!subject || !clientId || !sessionId) throw new AuthError("OAuth Access Token 缺少身份声明")

  const scopes = tokenScopes(payload.scope)
  const [user, client] = await Promise.all([
    prisma.user.findUnique({ where: { id: subject }, select: { id: true } }),
    prisma.oauthClient.findUnique({
      where: { clientId },
      select: {
        clientId: true,
        name: true,
        softwareId: true,
        disabled: true,
        public: true,
        requirePKCE: true,
        subjectType: true,
        tokenEndpointAuthMethod: true,
        grantTypes: true,
      },
    }),
  ])

  if (!user) throw new AuthError("OAuth 管理员身份无效")
  if (!client || client.disabled || !client.public || !client.requirePKCE
    || client.subjectType === "pairwise"
    || client.tokenEndpointAuthMethod !== "none"
    || !client.grantTypes.includes("authorization_code")) {
    throw new AuthError("OAuth Client 无效或已撤销")
  }

  return ensureOAuthMcpCredential({
    clientId,
    subject,
    name: client.name || client.softwareId || "未命名 Agent",
    scopes,
  })
}
