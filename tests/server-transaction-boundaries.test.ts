import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import path from "node:path"
import test from "node:test"
import { z } from "zod/v3"
import * as dates from "../lib/daily-date"
import * as errors from "../lib/errors"
import { loadRoute } from "./helpers/load-route"

const root = path.resolve(import.meta.dirname, "..")
class KnownRequestError extends Error { code = "test" }

for (const operation of ["disable", "delete"] as const) {
  for (const invalid of [false, true]) {
    test(`Daily ${operation} preserves replacement validation and write order (invalid=${invalid})`, async () => {
      const calls: string[] = []
      const usedDate = new Date("2000-08-10T00:00:00Z")
      const transaction = { dailyQuote: {
        findUnique: async ({ where }: { where: { id: number } }) => {
          calls.push(`read:${where.id}`)
          return where.id === 1 ? { id: 1, usedDate } : { id: 2, status: !invalid, usedDate: null }
        },
        update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          calls.push(`update:${where.id}:${JSON.stringify(data)}`)
          return { id: 1, quote: "quote", category: "category", author: null, source: null, sourceDetail: null, status: false, usedDate: null }
        },
        delete: async () => { calls.push("delete:1") },
      } }
      const service = loadRoute<typeof import("../lib/daily")>(path.join(root, "lib/daily.ts"), {
        "node:crypto": { createHash }, "@/lib/daily-date": dates, "@/lib/errors": errors,
        "@/lib/generated/prisma/client": { Prisma: { PrismaClientKnownRequestError: KnownRequestError } },
        "@/lib/db": { prisma: { $transaction: async (run: (tx: unknown) => unknown) => {
          calls.push("begin")
          try { const value = await run(transaction); calls.push("commit"); return value }
          catch (error) { calls.push("rollback"); throw error }
        } } },
      })
      const run = () => operation === "disable"
        ? service.updateDailyQuote(1, { status: false, replacementQuoteId: 2 })
        : service.deleteDailyQuote(1, 2)
      if (invalid) {
        await assert.rejects(run, /替代提醒语必须/)
        assert.deepEqual(calls, ["begin", "read:1", "read:2", "rollback"])
      } else {
        await run()
        assert.deepEqual(calls, ["begin", "read:1", "read:2", 'update:1:{"usedDate":null}',
          `update:2:${JSON.stringify({ usedDate })}`, operation === "disable" ? 'update:1:{"status":false}' : "delete:1", "commit"])
      }
    })
  }
}

for (const mode of ["new", "replay", "transaction-replay", "mismatched-tool", "write-failure"] as const) {
  test(`MCP approval completion keeps execution identity, transaction and ordering: ${mode}`, async () => {
    const calls: string[] = []
    const result = { categoryId: "category", name: "name", type: "BLOG" }
    let completed = false
    const existing = { toolName: mode === "mismatched-tool" ? "other-tool" : "create_category", resultSummary: result }
    const approvalUpdate = async ({ data }: { data: Record<string, unknown> }) => {
      calls.push("approve")
      assert.equal(data.status, "APPROVED")
      assert.deepEqual(data.resultSummary, result)
      assert.equal(data.processingAt, null)
      assert.equal(data.executionError, null)
      assert.ok(data.reviewedAt instanceof Date)
      assert.ok(data.executedAt instanceof Date)
      if (mode === "write-failure") throw new Error("approval write failed")
      completed = true
      return {}
    }
    const transaction = {
      mcpExecution: {
        findUnique: async () => { calls.push("tx:lookup"); return mode === "transaction-replay" ? existing : null },
        create: async ({ data }: { data: unknown }) => {
          calls.push("execution")
          assert.deepEqual(data, { approvalId: "approval", toolName: "create_category", resultSummary: result })
        },
      }, mcpApproval: { update: approvalUpdate },
    }
    const approval = {
      id: "approval", toolName: "create_category", status: "PENDING_APPROVAL", credentialId: "credential",
      requiredScope: "category:create", expiresAt: new Date(Date.now() + 60_000),
      credential: { revokedAt: null }, payload: { kind: "create_category", input: { name: "name", type: "BLOG" } },
    }
    const prisma = {
      mcpApproval: {
        findUnique: async () => ({ ...approval, status: completed ? "APPROVED" : "PENDING_APPROVAL" }),
        findUniqueOrThrow: async () => ({ id: "approval", status: "APPROVED", resultSummary: result }),
        updateMany: async () => { calls.push("claim-or-release"); return { count: 1 } },
        update: approvalUpdate,
      },
      mcpExecution: { findUnique: async () => {
        calls.push("lookup")
        return mode === "replay" || mode === "mismatched-tool" ? existing : null
      } },
      $transaction: async (run: (tx: unknown) => unknown) => {
        calls.push("begin")
        try { const value = await run(transaction); calls.push("commit"); return value }
        catch (error) { calls.push("rollback"); throw error }
      },
    }
    const service = loadRoute<typeof import("../lib/mcp/approval-service")>(path.join(root, "lib/mcp/approval-service.ts"), {
      "zod/v3": { z }, "../db": { prisma }, "../errors": errors,
      "../categories": { createCategory: async (_input: unknown, tx: unknown) => {
        assert.equal(tx, transaction); calls.push("operation"); return { id: "category", name: "name", type: "BLOG" }
      } },
      "../posts": {}, "../todos": {}, "../validation": { validateCategoryCreate: (value: unknown) => value },
      "./audit-service": { recordMcpAudit: async () => {}, errorDetails: (error: Error) => ({ message: error.message }) },
      "./credential-service": { MCP_SCOPES: ["category:create"], requireMcpScope: () => {} },
      "./deletion-policy": {},
    })
    if (mode === "mismatched-tool") {
      await assert.rejects(() => service.approveMcpApproval("approval"), /tool 不匹配/)
      assert.deepEqual(calls, ["claim-or-release", "lookup", "claim-or-release"])
    } else if (mode === "write-failure") {
      await assert.rejects(() => service.approveMcpApproval("approval"), /approval write failed/)
      assert.deepEqual(calls, ["claim-or-release", "lookup", "begin", "tx:lookup", "operation", "execution", "approve", "rollback", "claim-or-release"])
    } else {
      await service.approveMcpApproval("approval")
      assert.deepEqual(calls, mode === "replay" ? ["claim-or-release", "lookup", "approve"]
        : mode === "transaction-replay" ? ["claim-or-release", "lookup", "begin", "tx:lookup", "approve", "commit"]
          : ["claim-or-release", "lookup", "begin", "tx:lookup", "operation", "execution", "approve", "commit"])
    }
  })
}

for (const outcome of ["committed", "rolled-back", "unknown"] as const) {
  test(`MCP staged-import failure reconciles ${outcome} commit without premature image deletion`, async () => {
    const calls: string[] = []
    const warning = "原图已保留，响应式图片生成失败；当前使用原图。"
    const result = { postId: "post", title: "draft", status: "DRAFT", importedImageCount: 1,
      imageProcessingWarnings: [{ url: "/uploads/new.png", warning }] }
    let failed = false
    const approval = {
      id: "approval", toolName: "import", status: "PENDING_APPROVAL", credentialId: "credential",
      requiredScope: "draft:import", expiresAt: new Date(Date.now() + 60_000), credential: { revokedAt: null },
      payload: { kind: "create_draft_from_staged_markdown", bundleId: "10000000-0000-4000-8000-000000000001" },
    }
    const transaction = {
      mcpExecution: { findUnique: async () => null, create: async ({ data }: { data: { resultSummary: unknown } }) => {
        assert.deepEqual(data.resultSummary, result)
        calls.push("execution")
      } },
      mcpApproval: { update: async ({ data }: { data: { resultSummary: unknown } }) => {
        assert.deepEqual(data.resultSummary, result)
        calls.push("approve")
      } },
    }
    const prisma = {
      mcpApproval: {
        findUnique: async () => approval,
        findUniqueOrThrow: async () => ({ ...approval, status: "APPROVED", resultSummary: result }),
        updateMany: async () => ({ count: 1 }),
      },
      mcpExecution: { findUnique: async () => {
        if (!failed) return null
        calls.push("reconcile")
        if (outcome === "unknown") throw new Error("database unavailable")
        return outcome === "committed" ? { toolName: "import", resultSummary: result } : null
      } },
      $transaction: async (run: (tx: unknown) => unknown) => {
        await run(transaction)
        failed = true
        throw new Error("commit response lost")
      },
    }
    const service = loadRoute<typeof import("../lib/mcp/approval-service")>(path.join(root, "lib/mcp/approval-service.ts"), {
      "zod/v3": { z }, "../db": { prisma }, "../errors": errors, "../categories": {}, "../todos": {},
      "../posts": { createPost: async (_input: unknown, tx: unknown) => {
        assert.equal(tx, transaction); calls.push("post"); return { id: "post", title: "draft", status: "DRAFT" }
      } },
      "../validation": {}, "./deletion-policy": {},
      "./audit-service": { recordMcpAudit: async () => {}, errorDetails: (error: Error) => ({ message: error.message }) },
      "./credential-service": { MCP_SCOPES: ["draft:import"], requireMcpScope: () => {} },
      "./import-staging-service": {
        materializeStagedMarkdownImport: async () => ({ input: {}, importedImages: ["/uploads/new.png"],
          imageProcessing: [{ url: "/uploads/new.png", processing: { status: "failed", reason: "processing-failed", warning } }],
          cleanup: async () => { calls.push("delete-images") } }),
        cleanupStagedImportBundle: async (_id: string, consumed: boolean) => { assert.equal(consumed, true); calls.push("consume-bundle") },
      },
    })
    if (outcome === "committed") {
      const completed = await service.approveMcpApproval("approval")
      assert.ok(completed && typeof completed === "object" && !Array.isArray(completed) && "resultSummary" in completed)
      assert.deepEqual(completed.resultSummary, result)
      assert.deepEqual(calls, ["post", "execution", "approve", "reconcile", "consume-bundle"])
    } else {
      await assert.rejects(() => service.approveMcpApproval("approval"), /commit response lost/)
      assert.deepEqual(calls, ["post", "execution", "approve", "reconcile", ...(outcome === "rolled-back" ? ["delete-images"] : [])])
    }
  })
}
