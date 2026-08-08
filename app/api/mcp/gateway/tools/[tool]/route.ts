import { NextRequest } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { loadMcpSecurityConfig } from "@/lib/mcp/config"
import { mcpBearerCredential, mcpJson, requireJsonContentType } from "@/lib/mcp/http"
import { runGatewayMcpTool, type GatewayMcpToolName } from "@/lib/mcp/tool-service"
import { mcpToolInputSchemas } from "@/lib/mcp/tool-schemas"

const gatewayTools = new Set<GatewayMcpToolName>([
  "search_drafts",
  "update_draft_metadata",
  "create_category",
  "todo_to_draft",
])

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tool: string }> }
) {
  try {
    requireJsonContentType(request)
    const { tool } = await context.params
    if (!gatewayTools.has(tool as GatewayMcpToolName)) throw new NotFoundError("MCP tool 不存在")
    const name = tool as GatewayMcpToolName
    const token = mcpBearerCredential(request)
    const parsed = mcpToolInputSchemas[name].safeParse(await request.json())
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "MCP tool 参数无效")
    }
    const value = parsed.data
    const result = await runGatewayMcpTool(loadMcpSecurityConfig(token), name, value)
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}
