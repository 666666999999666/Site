import path from "path"
import { ConfigurationError } from "../errors"

export interface McpSecurityConfig {
  credential: string
  approvalTtlHours: number
  credentialRateLimit: number
  searchRateLimit: number
  writeRateLimit: number
}

export interface McpRuntimeConfig extends McpSecurityConfig {
  markdownRoot: string
  imageRoot: string
  remoteUrl: string | null
}

export interface McpFileConfig {
  markdownRoot: string
  imageRoot: string
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} 必须是正整数`)
  }
  return value
}

export function loadMcpRuntimeConfig(): McpRuntimeConfig {
  const credential = process.env.BLOG_MCP_CREDENTIAL?.trim()
  if (!credential) {
    throw new ConfigurationError("BLOG_MCP_CREDENTIAL 未配置")
  }

  const fileConfig = loadMcpFileConfig()
  const remoteUrl = optionalRemoteUrl()

  return {
    credential,
    ...fileConfig,
    remoteUrl,
    approvalTtlHours: positiveInteger("MCP_APPROVAL_TTL_HOURS", 24),
    credentialRateLimit: positiveInteger("MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE", 60),
    searchRateLimit: positiveInteger("MCP_SEARCH_RATE_LIMIT_PER_MINUTE", 30),
    writeRateLimit: positiveInteger("MCP_WRITE_RATE_LIMIT_PER_MINUTE", 10),
  }
}

export function loadMcpSecurityConfig(credential: string): McpSecurityConfig {
  return {
    credential,
    approvalTtlHours: positiveInteger("MCP_APPROVAL_TTL_HOURS", 24),
    credentialRateLimit: positiveInteger("MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE", 60),
    searchRateLimit: positiveInteger("MCP_SEARCH_RATE_LIMIT_PER_MINUTE", 30),
    writeRateLimit: positiveInteger("MCP_WRITE_RATE_LIMIT_PER_MINUTE", 10),
  }
}

function optionalRemoteUrl(): string | null {
  const raw = process.env.MCP_REMOTE_URL?.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigurationError("MCP_REMOTE_URL 必须是有效 URL")
  }
  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ConfigurationError("MCP_REMOTE_URL 必须使用 HTTPS，本机开发地址除外")
  }
  url.pathname = url.pathname.replace(/\/$/, "")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export function loadMcpFileConfig(): McpFileConfig {
  const markdownRoot = path.resolve(
    /* turbopackIgnore: true */
    process.env.MCP_MARKDOWN_ROOT || path.join(process.cwd(), "drafts")
  )
  const imageRoot = path.resolve(
    /* turbopackIgnore: true */
    process.env.MCP_IMAGE_ROOT || markdownRoot
  )
  return { markdownRoot, imageRoot }
}
