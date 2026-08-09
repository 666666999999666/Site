import { z } from "zod"
import { createCategory } from "../categories"
import { prisma } from "../db"
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../errors"
import { Prisma } from "../generated/prisma/client"
import { materializeMarkdownImport } from "../markdown-import"
import { createPost, updateDraftMetadata } from "../posts"
import { todoToDraft } from "../todos"
import { validateCategoryCreate, validatePostUpdate } from "../validation"
import { errorDetails, recordMcpAudit } from "./audit-service"
import { loadMcpFileConfig } from "./config"
import { MCP_SCOPES, type McpScope, requireMcpScope } from "./credential-service"
import { approvalDeletionBlockReason } from "./deletion-policy"

const markdownPayloadSchema = z.object({
  kind: z.literal("create_draft_from_markdown"),
  sourcePath: z.string().min(1),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  images: z.array(z.object({
    reference: z.string().min(1),
    path: z.string().min(1),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).max(200),
}).strict()

const stagedMarkdownPayloadSchema = z.object({
  kind: z.literal("create_draft_from_staged_markdown"),
  bundleId: z.string().uuid(),
}).strict()

const updatePayloadSchema = z.object({
  kind: z.literal("update_draft_metadata"),
  postId: z.string().min(1).max(128),
  input: z.object({
    title: z.string().optional(),
    excerpt: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    coverImage: z.string().nullable().optional(),
    draftMetadata: z.record(z.unknown()).nullable().optional(),
  }).strict(),
}).strict()

const categoryPayloadSchema = z.object({
  kind: z.literal("create_category"),
  input: z.object({
    name: z.string(),
    type: z.enum(["BLOG", "TODO"]),
    description: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }).strict(),
}).strict()

const todoPayloadSchema = z.object({
  kind: z.literal("todo_to_draft"),
  todoId: z.string().min(1).max(128),
  markDone: z.boolean(),
}).strict()

const actionPayloadSchema = z.discriminatedUnion("kind", [
  markdownPayloadSchema,
  stagedMarkdownPayloadSchema,
  updatePayloadSchema,
  categoryPayloadSchema,
  todoPayloadSchema,
])

export type McpApprovalPayload = z.infer<typeof actionPayloadSchema>
type JsonSummary = Record<string, unknown>

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function createMcpApproval(input: {
  credentialId: string
  toolName: string
  requiredScope: McpScope
  payload: McpApprovalPayload
  parameterSummary: JsonSummary
  ttlHours: number
  database?: Pick<Prisma.TransactionClient, "mcpApproval">
}) {
  const payload = actionPayloadSchema.parse(input.payload)
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000)
  const database = input.database ?? prisma
  return database.mcpApproval.create({
    data: {
      credentialId: input.credentialId,
      toolName: input.toolName,
      requiredScope: input.requiredScope,
      payload: jsonValue(payload),
      parameterSummary: jsonValue(input.parameterSummary),
      expiresAt,
    },
    select: { id: true, status: true, expiresAt: true, createdAt: true },
  })
}

export async function listMcpApprovals(input: {
  status?: "PENDING_APPROVAL" | "APPROVED" | "REJECTED"
  limit?: number
} = {}) {
  if (!input.status || input.status === "PENDING_APPROVAL") {
    await cleanupExpiredMcpApprovals()
  }
  return prisma.mcpApproval.findMany({
    where: { status: input.status },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    select: {
      id: true,
      toolName: true,
      requiredScope: true,
      status: true,
      parameterSummary: true,
      resultSummary: true,
      executionError: true,
      processingAt: true,
      reviewedAt: true,
      executedAt: true,
      expiresAt: true,
      createdAt: true,
      credential: { select: { id: true, name: true, revokedAt: true } },
    },
  })
}

function approvalResultObject(value: Prisma.JsonValue | null): JsonSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonSummary
}

export async function getMcpApprovalStatus(id: string, credentialId: string) {
  await rejectExpiredApproval(id, credentialId)
  const approval = await prisma.mcpApproval.findFirst({
    where: { id, credentialId },
    select: {
      id: true,
      toolName: true,
      status: true,
      resultSummary: true,
      executionError: true,
      processingAt: true,
      reviewedAt: true,
      executedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  })
  if (!approval) throw new NotFoundError("审批请求不存在")

  const result = approvalResultObject(approval.resultSummary)
  const status = approval.status === "PENDING_APPROVAL"
    ? "pending_approval"
    : approval.status === "APPROVED"
      ? "approved"
      : "rejected"

  return {
    approval_id: approval.id,
    tool_name: approval.toolName,
    status,
    processing: approval.processingAt !== null,
    expired: approval.executionError === "审批请求已过期",
    failure_reason: approval.executionError,
    post_id: typeof result?.postId === "string" ? result.postId : null,
    category_id: typeof result?.categoryId === "string" ? result.categoryId : null,
    todo_id: typeof result?.todoId === "string" ? result.todoId : null,
    result,
    created_at: approval.createdAt.toISOString(),
    expires_at: approval.expiresAt.toISOString(),
    reviewed_at: approval.reviewedAt?.toISOString() ?? null,
    executed_at: approval.executedAt?.toISOString() ?? null,
  }
}

async function cleanupApprovalBundle(approvalId: string) {
  const bundle = await prisma.mcpImportBundle.findUnique({
    where: { approvalId },
    select: { id: true, cleanedAt: true },
  })
  if (!bundle || bundle.cleanedAt) return
  const { cleanupStagedImportBundle } = await import("./import-staging-service")
  await cleanupStagedImportBundle(bundle.id).catch((error) => {
    console.error("[MCP staging cleanup failure]", error)
  })
}

async function rejectExpiredApproval(id: string, credentialId?: string): Promise<boolean> {
  const now = new Date()
  const expired = await prisma.mcpApproval.updateMany({
    where: {
      id,
      credentialId,
      status: "PENDING_APPROVAL",
      processingAt: null,
      expiresAt: { lte: now },
    },
    data: {
      status: "REJECTED",
      reviewedAt: now,
      executionError: "审批请求已过期",
      processingAt: null,
    },
  })
  if (expired.count === 1) await cleanupApprovalBundle(id)
  return expired.count === 1
}

export async function cleanupExpiredMcpApprovals(limit = 50): Promise<number> {
  const approvals = await prisma.mcpApproval.findMany({
    where: {
      status: "PENDING_APPROVAL",
      processingAt: null,
      expiresAt: { lte: new Date() },
    },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
    select: { id: true },
  })
  let cleaned = 0
  for (const approval of approvals) {
    if (await rejectExpiredApproval(approval.id)) cleaned += 1
  }
  return cleaned
}

function resultObject(value: Prisma.JsonValue): JsonSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("MCP 幂等执行记录无效")
  }
  return value as JsonSummary
}

async function existingExecution(approvalId: string, toolName: string) {
  const execution = await prisma.mcpExecution.findUnique({ where: { approvalId } })
  if (!execution) return null
  if (execution.toolName !== toolName) {
    throw new PermissionError("审批执行记录与 tool 不匹配")
  }
  return resultObject(execution.resultSummary)
}

async function runDatabaseExecution(
  approvalId: string,
  toolName: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<JsonSummary>
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.mcpExecution.findUnique({ where: { approvalId } })
    if (existing) {
      if (existing.toolName !== toolName) {
        throw new PermissionError("审批执行记录与 tool 不匹配")
      }
      const result = resultObject(existing.resultSummary)
      await transaction.mcpApproval.update({
        where: { id: approvalId },
        data: {
          status: "APPROVED",
          resultSummary: jsonValue(result),
          reviewedAt: new Date(),
          executedAt: new Date(),
          processingAt: null,
          executionError: null,
        },
      })
      return { result, reused: true }
    }

    const result = await operation(transaction)
    await transaction.mcpExecution.create({
      data: {
        approvalId,
        toolName,
        resultSummary: jsonValue(result),
      },
    })
    await transaction.mcpApproval.update({
      where: { id: approvalId },
      data: {
        status: "APPROVED",
        resultSummary: jsonValue(result),
        reviewedAt: new Date(),
        executedAt: new Date(),
        processingAt: null,
        executionError: null,
      },
    })
    return { result, reused: false }
  })
}

async function dispatchApproval(
  approvalId: string,
  toolName: string,
  payloadValue: Prisma.JsonValue
) {
  const payload = actionPayloadSchema.parse(payloadValue)
  const completed = await existingExecution(approvalId, toolName)
  if (completed) {
    await prisma.mcpApproval.update({
      where: { id: approvalId },
      data: {
        status: "APPROVED",
        resultSummary: jsonValue(completed),
        reviewedAt: new Date(),
        executedAt: new Date(),
        processingAt: null,
        executionError: null,
      },
    })
    if (payload.kind === "create_draft_from_staged_markdown") {
      const { cleanupStagedImportBundle } = await import("./import-staging-service")
      await cleanupStagedImportBundle(payload.bundleId, true).catch((error) => {
        console.error("[MCP staging cleanup failure]", error)
      })
    }
    return completed
  }

  switch (payload.kind) {
    case "create_draft_from_markdown": {
      const materialized = await materializeMarkdownImport(payload, loadMcpFileConfig())
      try {
        const execution = await runDatabaseExecution(approvalId, toolName, async (transaction) => {
          const post = await createPost(materialized.input, transaction)
          return {
            postId: post.id,
            title: post.title,
            status: post.status,
            importedImageCount: materialized.importedImages.length,
          }
        })
        if (execution.reused) await materialized.cleanup()
        return execution.result
      } catch (error) {
        let completedAfterError: JsonSummary | null = null
        let executionStateKnown = true
        try {
          completedAfterError = await existingExecution(approvalId, toolName)
        } catch (lookupError) {
          executionStateKnown = false
          console.error("[MCP execution reconciliation failure]", lookupError)
        }
        if (completedAfterError) return completedAfterError
        if (executionStateKnown) await materialized.cleanup()
        throw error
      }
    }
    case "create_draft_from_staged_markdown": {
      const { cleanupStagedImportBundle, materializeStagedMarkdownImport } = await import("./import-staging-service")
      const materialized = await materializeStagedMarkdownImport(payload.bundleId)
      try {
        const execution = await runDatabaseExecution(approvalId, toolName, async (transaction) => {
          const post = await createPost(materialized.input, transaction)
          return {
            postId: post.id,
            title: post.title,
            status: post.status,
            importedImageCount: materialized.importedImages.length,
          }
        })
        if (execution.reused) await materialized.cleanup()
        await cleanupStagedImportBundle(payload.bundleId, true).catch((error) => {
          console.error("[MCP staging cleanup failure]", error)
        })
        return execution.result
      } catch (error) {
        let completedAfterError: JsonSummary | null = null
        let executionStateKnown = true
        try {
          completedAfterError = await existingExecution(approvalId, toolName)
        } catch (lookupError) {
          executionStateKnown = false
          console.error("[MCP execution reconciliation failure]", lookupError)
        }
        if (completedAfterError) {
          await cleanupStagedImportBundle(payload.bundleId, true).catch((cleanupError) => {
            console.error("[MCP staging cleanup failure]", cleanupError)
          })
          return completedAfterError
        }
        // If the database is unreachable, preserve files until orphan cleanup can
        // prove they are unreferenced. This avoids deleting images after an
        // ambiguous transaction commit.
        if (executionStateKnown) await materialized.cleanup()
        throw error
      }
    }
    case "update_draft_metadata": {
      const input = validatePostUpdate(payload.input)
      return (await runDatabaseExecution(approvalId, toolName, async (transaction) => {
        const post = await updateDraftMetadata(payload.postId, input, transaction)
        return { postId: post.id, title: post.title, status: post.status }
      })).result
    }
    case "create_category": {
      const input = validateCategoryCreate(payload.input)
      return (await runDatabaseExecution(approvalId, toolName, async (transaction) => {
        const category = await createCategory(input, transaction)
        return { categoryId: category.id, name: category.name, type: category.type }
      })).result
    }
    case "todo_to_draft": {
      return (await runDatabaseExecution(approvalId, toolName, async (transaction) => {
        const result = await todoToDraft(payload.todoId, payload.markDone, transaction)
        return {
          postId: result.post.id,
          title: result.post.title,
          todoId: result.todo.id,
          todoStatus: result.todo.status,
        }
      })).result
    }
  }
}

export async function approveMcpApproval(id: string) {
  const approval = await prisma.mcpApproval.findUnique({
    where: { id },
    include: { credential: true },
  })
  if (!approval) throw new NotFoundError("审批请求不存在")
  if (approval.status === "APPROVED") return approval.resultSummary
  if (approval.status === "REJECTED") throw new ConflictError("审批请求已被拒绝")
  if (approval.expiresAt.getTime() <= Date.now()) {
    if (!await rejectExpiredApproval(id)) throw new ConflictError("审批请求正在执行")
    throw new ValidationError("审批请求已过期")
  }
  if (approval.credential.revokedAt) {
    throw new PermissionError("发起请求的 MCP credential 已撤销")
  }
  if (!MCP_SCOPES.includes(approval.requiredScope as McpScope)) {
    throw new PermissionError("审批请求包含未知 scope")
  }
  requireMcpScope(approval.credential, approval.requiredScope as McpScope)

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000)
  const claim = await prisma.mcpApproval.updateMany({
    where: {
      id,
      status: "PENDING_APPROVAL",
      OR: [{ processingAt: null }, { processingAt: { lt: staleBefore } }],
    },
    data: { processingAt: new Date(), executionError: null },
  })
  if (claim.count !== 1) throw new ConflictError("审批请求正在执行")

  try {
    const result = await dispatchApproval(approval.id, approval.toolName, approval.payload)
    const completed = await prisma.mcpApproval.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, resultSummary: true, executedAt: true },
    })
    await recordMcpAudit({
      credentialId: approval.credentialId,
      toolName: approval.toolName,
      parameterSummary: { approvalId: id, phase: "approval_execution" },
      resultSummary: result,
      success: true,
    }).catch((auditError) => {
      console.error("[MCP approval audit failure]", auditError)
    })
    return completed
  } catch (error) {
    const reconciled = await prisma.mcpApproval.findUnique({
      where: { id },
      select: { id: true, status: true, resultSummary: true, executedAt: true },
    }).catch(() => null)
    if (reconciled?.status === "APPROVED") return reconciled

    await prisma.mcpApproval.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: {
        processingAt: null,
        executionError: errorDetails(error).message,
      },
    })
    await recordMcpAudit({
      credentialId: approval.credentialId,
      toolName: approval.toolName,
      parameterSummary: { approvalId: id, phase: "approval_execution" },
      success: false,
      error,
    }).catch((auditError) => {
      console.error("[MCP approval audit failure]", auditError)
    })
    throw error
  }
}

export async function rejectMcpApproval(id: string, reasonValue?: string) {
  const reason = reasonValue?.trim().slice(0, 1000) || "人工拒绝"
  const approval = await prisma.mcpApproval.findUnique({ where: { id } })
  if (!approval) throw new NotFoundError("审批请求不存在")
  if (approval.status === "PENDING_APPROVAL" && approval.expiresAt.getTime() <= Date.now()) {
    await rejectExpiredApproval(id)
    throw new ValidationError("审批请求已过期")
  }
  if (approval.status !== "PENDING_APPROVAL") {
    throw new ConflictError("只能拒绝待审批请求")
  }
  if (approval.processingAt) throw new ConflictError("审批请求正在执行")

  const result = await prisma.mcpApproval.updateMany({
    where: { id, status: "PENDING_APPROVAL", processingAt: null },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      executionError: reason,
    },
  })
  if (result.count !== 1) throw new ConflictError("审批请求状态已变化")
  const rejected = await prisma.mcpApproval.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true, reviewedAt: true },
  })
  const payload = actionPayloadSchema.parse(approval.payload)
  if (payload.kind === "create_draft_from_staged_markdown") {
    const { cleanupStagedImportBundle } = await import("./import-staging-service")
    await cleanupStagedImportBundle(payload.bundleId).catch((error) => {
      console.error("[MCP staging cleanup failure]", error)
    })
  }
  await recordMcpAudit({
    credentialId: approval.credentialId,
    toolName: approval.toolName,
    parameterSummary: { approvalId: id, phase: "approval_rejection" },
    resultSummary: { status: "rejected", reason },
    success: true,
  }).catch((auditError) => {
    console.error("[MCP approval audit failure]", auditError)
  })
  return rejected
}

export async function deleteMcpApproval(id: string) {
  const approval = await prisma.mcpApproval.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      processingAt: true,
      importBundle: { select: { id: true, cleanedAt: true } },
    },
  })
  if (!approval) throw new NotFoundError("审批请求不存在")
  const blocked = approvalDeletionBlockReason(approval)
  if (blocked) throw new ConflictError(blocked)

  if (approval.importBundle && !approval.importBundle.cleanedAt) {
    const { cleanupStagedImportBundle } = await import("./import-staging-service")
    await cleanupStagedImportBundle(approval.importBundle.id)
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.mcpExecution.deleteMany({ where: { approvalId: id } })
    await transaction.mcpImportBundle.deleteMany({ where: { approvalId: id } })
    await transaction.mcpApproval.delete({ where: { id } })
  })
  return { id, deleted: true }
}
