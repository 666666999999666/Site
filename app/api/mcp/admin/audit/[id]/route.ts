import { NextRequest } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"
import { PermissionError } from "@/lib/errors"
import { deleteMcpAuditLog } from "@/lib/mcp/audit-service"
import { mcpJson } from "@/lib/mcp/http"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    if (!validateOrigin(request, { requireOrigin: true })) throw new PermissionError("请求来源无效")
    const { id } = await context.params
    return mcpJson(await deleteMcpAuditLog(id))
  } catch (error) {
    return handleApiError(error)
  }
}
