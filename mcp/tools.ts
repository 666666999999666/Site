import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { AppError } from "../lib/errors"
import { errorDetails } from "../lib/mcp/audit-service"
import type { McpRuntimeConfig } from "../lib/mcp/config"
import { runLocalMcpTool } from "../lib/mcp/tool-service"
import type { McpToolInputMap, McpToolName } from "../lib/mcp/tool-schemas"
import { createRegisteredBlogMcpServer } from "./register-tools"

function result(value: Record<string, unknown>, isError = false): CallToolResult {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  }
}

function safeToolError(error: unknown) {
  const details = errorDetails(error)
  if (!(error instanceof AppError)) console.error("[MCP tool error]", error)
  return { error: error instanceof AppError ? details.message : "MCP tool 执行失败", code: details.code }
}

export function createBlogMcpServer(config: McpRuntimeConfig) {
  return createRegisteredBlogMcpServer(async <Name extends McpToolName>(
    name: Name,
    input: McpToolInputMap[Name]
  ) => {
    try {
      return result(await runLocalMcpTool(config, name, input))
    } catch (error) {
      return result(safeToolError(error), true)
    }
  })
}
