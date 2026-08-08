import path from "path"
import { ConfigurationError } from "../errors"

export interface McpRuntimeConfig {
  credential: string
  markdownRoot: string
  imageRoot: string
  approvalTtlHours: number
  credentialRateLimit: number
  searchRateLimit: number
  writeRateLimit: number
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

  return {
    credential,
    ...fileConfig,
    approvalTtlHours: positiveInteger("MCP_APPROVAL_TTL_HOURS", 24),
    credentialRateLimit: positiveInteger("MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE", 60),
    searchRateLimit: positiveInteger("MCP_SEARCH_RATE_LIMIT_PER_MINUTE", 30),
    writeRateLimit: positiveInteger("MCP_WRITE_RATE_LIMIT_PER_MINUTE", 10),
  }
}

export function loadMcpFileConfig(): McpFileConfig {
  const markdownRoot = path.resolve(
    process.env.MCP_MARKDOWN_ROOT || path.join(process.cwd(), "drafts")
  )
  const imageRoot = path.resolve(process.env.MCP_IMAGE_ROOT || markdownRoot)
  return { markdownRoot, imageRoot }
}
