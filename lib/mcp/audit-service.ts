import { AppError, ConflictError, NotFoundError } from "../errors"
import { Prisma } from "../generated/prisma/client"
import { prisma } from "../db"
import { auditDeletionBlockReason } from "./deletion-policy"

type JsonSummary = Record<string, unknown>

function jsonValue(value: JsonSummary): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  if (error instanceof Error) {
    return { code: error.name || "ERROR", message: "内部错误，详细信息仅写入本地 stderr" }
  }
  return { code: "UNKNOWN_ERROR", message: "未知错误" }
}

async function existingCredentialId(value: string | null): Promise<string | null> {
  if (!value) return null
  return await prisma.mcpCredential.findUnique({ where: { id: value }, select: { id: true } })
    ? value
    : null
}

export async function beginMcpAudit(input: {
  credentialId: string | null
  toolName: string
  parameterSummary: JsonSummary
}) {
  return prisma.mcpAuditLog.create({
    data: {
      credentialId: await existingCredentialId(input.credentialId),
      toolName: input.toolName,
      parameterSummary: jsonValue(input.parameterSummary),
      status: "IN_PROGRESS",
      success: false,
    },
    select: { id: true },
  })
}

export function completeMcpAuditSuccess(id: string, resultSummary: JsonSummary) {
  return prisma.mcpAuditLog.update({
    where: { id },
    data: {
      resultSummary: jsonValue(resultSummary),
      status: "SUCCESS",
      success: true,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  })
}

export function completeMcpAuditFailure(id: string, error: unknown) {
  const details = errorDetails(error)
  return prisma.mcpAuditLog.update({
    where: { id },
    data: {
      status: "FAILURE",
      success: false,
      completedAt: new Date(),
      errorCode: details.code,
      errorMessage: details.message,
    },
  })
}

export async function recordMcpAudit(input: {
  credentialId: string | null
  toolName: string
  parameterSummary: JsonSummary
  resultSummary?: JsonSummary
  success: boolean
  error?: unknown
}) {
  const audit = await beginMcpAudit(input)
  if (input.success) return completeMcpAuditSuccess(audit.id, input.resultSummary ?? {})
  return completeMcpAuditFailure(audit.id, input.error ?? new Error("MCP 操作失败"))
}

export async function recoverInterruptedMcpAudits(now = new Date()) {
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000)
  return prisma.mcpAuditLog.updateMany({
    where: { status: "IN_PROGRESS", createdAt: { lt: staleBefore } },
    data: {
      status: "INTERRUPTED",
      success: false,
      completedAt: now,
      errorCode: "INTERRUPTED",
      errorMessage: "操作审计未正常收尾，业务结果需结合审批或执行记录核对",
    },
  })
}

export async function listMcpAuditLogs(input: {
  credentialId?: string
  toolName?: string
  limit?: number
}) {
  return prisma.mcpAuditLog.findMany({
    where: {
      credentialId: input.credentialId,
      toolName: input.toolName,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    include: { credential: { select: { name: true } } },
  })
}

export async function deleteMcpAuditLog(id: string) {
  const audit = await prisma.mcpAuditLog.findUnique({ where: { id }, select: { status: true } })
  if (!audit) throw new NotFoundError("MCP 审计记录不存在")
  const blocked = auditDeletionBlockReason(audit.status)
  if (blocked) throw new ConflictError(blocked)
  const deleted = await prisma.mcpAuditLog.deleteMany({ where: { id, status: { not: "IN_PROGRESS" } } })
  if (deleted.count === 0) throw new NotFoundError("MCP 审计记录不存在")
  return { id, deleted: true }
}
