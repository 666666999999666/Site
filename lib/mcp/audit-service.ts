import { Prisma } from "../generated/prisma/client"
import { AppError } from "../errors"
import { prisma } from "../db"

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

export async function recordMcpAudit(input: {
  credentialId: string | null
  toolName: string
  parameterSummary: JsonSummary
  resultSummary?: JsonSummary
  success: boolean
  error?: unknown
}) {
  const details = input.error ? errorDetails(input.error) : null
  const credentialId = input.credentialId && await prisma.mcpCredential.findUnique({
    where: { id: input.credentialId },
    select: { id: true },
  }) ? input.credentialId : null
  return prisma.mcpAuditLog.create({
    data: {
      credentialId,
      toolName: input.toolName,
      parameterSummary: jsonValue(input.parameterSummary),
      resultSummary: input.resultSummary ? jsonValue(input.resultSummary) : undefined,
      success: input.success,
      errorCode: details?.code ?? null,
      errorMessage: details?.message ?? null,
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
