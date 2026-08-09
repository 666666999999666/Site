export type McpApprovalDeletionState = {
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED"
  processingAt: Date | string | null
}

export function credentialDeletionBlockReason(input: {
  revokedAt: Date | string | null
  approvalCount: number
}): string | null {
  if (!input.revokedAt) return "请先撤销该 MCP credential，再永久删除"
  if (input.approvalCount > 0) {
    return `该 credential 仍有关联的 ${input.approvalCount} 条审批记录，请先删除这些审批记录`
  }
  return null
}

export function approvalDeletionBlockReason(input: McpApprovalDeletionState): string | null {
  if (input.processingAt) return "审批请求正在执行，不能删除"
  if (input.status === "PENDING_APPROVAL") return "待审批请求不能直接删除，请先批准或拒绝"
  return null
}

export function auditDeletionBlockReason(status: "IN_PROGRESS" | "SUCCESS" | "FAILURE" | "INTERRUPTED"): string | null {
  return status === "IN_PROGRESS" ? "执行中的审计记录不能删除" : null
}
