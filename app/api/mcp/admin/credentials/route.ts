import { NextRequest } from "next/server"
import { z } from "zod"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"
import { PermissionError, ValidationError } from "@/lib/errors"
import { createMcpCredential, MCP_SCOPES } from "@/lib/mcp/credential-service"
import { mcpJson, requireJsonContentType } from "@/lib/mcp/http"

const inputSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).max(MCP_SCOPES.length),
}).strict()

export async function POST(request: NextRequest) {
  try {
    await ensureAuthenticated()
    if (!validateOrigin(request, { requireOrigin: true })) throw new PermissionError("请求来源无效")
    requireJsonContentType(request)
    const parsed = inputSchema.safeParse(await request.json())
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "MCP credential 参数无效")
    const created = await createMcpCredential(parsed.data.name, parsed.data.scopes)
    return mcpJson(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
