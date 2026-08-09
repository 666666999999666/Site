import { hkdfSync } from "crypto"
import { ConfigurationError } from "../errors"
import { MCP_SCOPES } from "../mcp/scopes"
import { getSiteUrl } from "../site"

const OAUTH_CONTEXT = "qz-blog-mcp-oauth-v1"
const BUILD_ONLY_SESSION_SECRET = "qz-blog-build-only-session-secret-000000000000"
const BUILD_ONLY_SITE_URL = "https://liaoqizai.site"

export const OAUTH_ACCESS_TOKEN_SECONDS = 15 * 60
export const OAUTH_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60
export const OAUTH_CODE_SECONDS = 5 * 60
export const OAUTH_SESSION_SECONDS = 14 * 24 * 60 * 60

export const OAUTH_SCOPES = [...MCP_SCOPES, "offline_access"] as const

function configuredSiteUrl(): URL {
  const buildPhase = process.env.NEXT_PHASE === "phase-production-build"
  const url = buildPhase && !process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(BUILD_ONLY_SITE_URL)
    : getSiteUrl()
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new ConfigurationError("生产环境 NEXT_PUBLIC_SITE_URL 必须使用 HTTPS")
  }
  return url
}

export function oauthSiteOrigin(): string {
  return configuredSiteUrl().origin
}

export function oauthIssuer(): string {
  return new URL("/api/oauth", configuredSiteUrl()).toString().replace(/\/$/, "")
}

export function mcpResourceUrl(): string {
  return new URL("/api/mcp", configuredSiteUrl()).toString()
}

export function oauthJwksUrl(): string {
  return `${oauthIssuer()}/jwks`
}

export function oauthSecret(): string {
  const configured = process.env.SESSION_SECRET
  const buildPhase = process.env.NEXT_PHASE === "phase-production-build"
  const source = configured || (buildPhase ? BUILD_ONLY_SESSION_SECRET : "")
  if (source.length < 32) {
    throw new ConfigurationError("SESSION_SECRET 必须至少包含 32 个字符")
  }

  return Buffer.from(
    hkdfSync("sha256", Buffer.from(source), Buffer.alloc(0), OAUTH_CONTEXT, 32)
  ).toString("base64url")
}

export function isProductionMcpHost(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true
  const configured = configuredSiteUrl()
  const requestUrl = new URL(request.url)
  const host = request.headers.get("host") || requestUrl.host
  return host.toLowerCase() === configured.host.toLowerCase()
}

export function isAllowedMcpOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).origin === oauthSiteOrigin()
  } catch {
    return false
  }
}
