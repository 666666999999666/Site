import { NextRequest } from "next/server"
import { z } from "zod"
import { ensureAuthenticated } from "@/lib/api/auth"
import { handleApiError } from "@/lib/api/handler"
import { validateOrigin } from "@/lib/csrf"
import { PermissionError, ValidationError } from "@/lib/errors"
import { approveMcpApproval, deleteMcpApproval, rejectMcpApproval } from "@/lib/mcp/approval-service"
import { mcpJson, requireJsonContentType } from "@/lib/mcp/http"

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }).strict(),
  z.object({ decision: z.literal("reject"), reason: z.string().max(1000).optional() }).strict(),
])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    if (!validateOrigin(request, { requireOrigin: true })) throw new PermissionError("请求来源无效")
    requireJsonContentType(request)
    const parsed = decisionSchema.safeParse(await request.json())
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "审批参数无效")
    const { id } = await context.params
    const result = parsed.data.decision === "approve"
      ? await approveMcpApproval(id)
      : await rejectMcpApproval(id, parsed.data.reason)
    return mcpJson(result)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAuthenticated()
    if (!validateOrigin(request, { requireOrigin: true })) throw new PermissionError("请求来源无效")
    const { id } = await context.params
    return mcpJson(await deleteMcpApproval(id))
  } catch (error) {
    return handleApiError(error)
  }
}
