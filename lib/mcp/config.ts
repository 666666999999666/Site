import { ConfigurationError } from "../errors"

export interface McpSecurityConfig {
  approvalTtlHours: number
  importUploadTtlMinutes: number
  credentialRateLimit: number
  searchRateLimit: number
  writeRateLimit: number
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

export function loadMcpSecurityConfig(): McpSecurityConfig {
  return {
    approvalTtlHours: positiveInteger("MCP_APPROVAL_TTL_HOURS", 24),
    importUploadTtlMinutes: positiveInteger("MCP_IMPORT_UPLOAD_TTL_MINUTES", 20),
    credentialRateLimit: positiveInteger("MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE", 60),
    searchRateLimit: positiveInteger("MCP_SEARCH_RATE_LIMIT_PER_MINUTE", 30),
    writeRateLimit: positiveInteger("MCP_WRITE_RATE_LIMIT_PER_MINUTE", 10),
  }
}
