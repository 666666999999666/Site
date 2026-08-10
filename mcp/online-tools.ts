import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { AppError } from "../lib/errors"
import { errorDetails } from "../lib/mcp/audit-service"
import type { McpSecurityConfig } from "../lib/mcp/config"
import type { McpAuthenticatedContext } from "../lib/mcp/auth-context"
import {
  createRemoteImportBundle,
  submitRemoteImportBundle,
} from "../lib/mcp/import-staging-service"
import {
  runGatewayMcpTool,
  type GatewayMcpToolName,
} from "../lib/mcp/tool-service"
import type { McpToolInputMap } from "../lib/mcp/tool-schemas"
import {
  createRegisteredOnlineMcpServer,
  type OnlineMcpToolName,
} from "./register-tools"

function result(value: Record<string, unknown>, isError = false): CallToolResult {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  }
}

function safeToolError(error: unknown) {
  const details = errorDetails(error)
  if (!(error instanceof AppError)) console.error("[MCP HTTP tool error]", error)
  return {
    error: error instanceof AppError ? details.message : "MCP tool 执行失败",
    code: details.code,
  }
}

export function createOnlineBlogMcpServer(
  context: McpAuthenticatedContext,
  config: McpSecurityConfig
) {
  return createRegisteredOnlineMcpServer(async <Name extends OnlineMcpToolName>(
    name: Name,
    input: McpToolInputMap[Name]
  ) => {
    try {
      if (name === "begin_markdown_draft_import") {
        return result(await createRemoteImportBundle({ context, config, value: input }))
      }
      if (name === "finalize_markdown_draft_import") {
        const args = input as McpToolInputMap["finalize_markdown_draft_import"]
        return result(await submitRemoteImportBundle({
          context,
          config,
          bundleId: args.bundle_id,
          uploadToken: args.upload_token,
        }))
      }
      const gatewayName = name as GatewayMcpToolName
      const gatewayInput = input as McpToolInputMap[GatewayMcpToolName]
      return result(await runGatewayMcpTool(context, config, gatewayName, gatewayInput))
    } catch (error) {
      return result(safeToolError(error), true)
    }
  })
}
