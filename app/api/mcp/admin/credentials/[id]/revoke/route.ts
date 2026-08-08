import { NextRequest } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"
import { PermissionError } from "@/lib/errors"
import { revokeMcpCredential } from "@/lib/mcp/credential-service"
import { mcpJson } from "@/lib/mcp/http"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    if (!validateOrigin(request, { requireOrigin: true })) throw new PermissionError("请求来源无效")
    const { id } = await context.params
    return mcpJson(await revokeMcpCredential(id))
  } catch (error) {
    return handleApiError(error)
  }
}
