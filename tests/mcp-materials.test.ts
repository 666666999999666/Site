import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { z } from "zod/v3"
import * as materialSchemas from "../lib/mcp/material-schemas"
import * as ideaSchemas from "../lib/ideas-validation"
import * as errors from "../lib/errors"
import * as idempotency from "../lib/mcp/material-idempotency"
import type { McpScope } from "../lib/mcp/scopes"
import { loadRoute } from "./helpers/load-route"
import type { McpAuthenticatedContext } from "../lib/mcp/auth-context"

const root = path.resolve(import.meta.dirname, "..")
const context: McpAuthenticatedContext = {
  credentialId: "agent-a", clientName: "test", subject: "owner-a", authType: "oauth",
  scopes: ["material:read", "material:write", "material:convert"],
}
const config = { approvalTtlHours: 24, importUploadTtlMinutes: 20,
  credentialRateLimit: 100, writeRateLimit: 20, searchRateLimit: 20 }

test("material schemas preserve exact raw input and reject ownership/raw mutation", () => {
  const raw = "  todo: a quoted fragment\r\n七个想法不是七个任务\n"
  assert.equal(materialSchemas.createMaterialInputSchema.parse({ raw_input: raw, request_key: "capture-1" }).raw_input, raw)
  for (const field of ["rawInput", "source", "capturedAt", "ownerId", "visibility"]) {
    assert.throws(() => materialSchemas.updateMaterialInputSchema.parse({
      material_id: "material", request_key: "update-1", changes: { [field]: "changed" },
    }))
  }
  assert.throws(() => materialSchemas.createMaterialInputSchema.parse({ raw_input: "  ", request_key: "capture-1" }))
  assert.throws(() => materialSchemas.listMaterialsInputSchema.parse({ ownerId: "someone-else" }))
  assert.throws(() => materialSchemas.convertMaterialInputSchema.parse({
    material_id: "material", request_key: "convert-1", conversion: { targetType: "PUBLISHED", title: "private" },
  }))
})

test("material approval identity isolates credentials, tools and changed payloads", () => {
  const id = idempotency.materialApprovalId("agent-a", "create_material", "capture-1")
  assert.equal(id, idempotency.materialApprovalId("agent-a", "create_material", "capture-1"))
  assert.notEqual(id, idempotency.materialApprovalId("agent-b", "create_material", "capture-1"))
  assert.notEqual(id, idempotency.materialApprovalId("agent-a", "update_material", "capture-1"))
  assert.equal(idempotency.canonicalMcpPayload({ b: 2, a: { y: 1, x: [2, 3] } }),
    idempotency.canonicalMcpPayload({ a: { x: [2, 3], y: 1 }, b: 2 }))
  assert.notEqual(idempotency.canonicalMcpPayload({ rawInput: "a " }), idempotency.canonicalMcpPayload({ rawInput: "a" }))
})

function materialService() {
  const accesses: unknown[] = []
  const auditParameters: unknown[] = []
  const approvals: unknown[] = []
  const material = {
    id: "material-a", title: "private title", rawInput: "original private raw", content: "edited content",
    source: "test", capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(1),
    discussionStatus: "WANT_DISCUSS", discussionSummary: "resume here", conversions: [], tags: [],
  }
  const service = loadRoute<typeof import("../lib/mcp/material-tool-service")>(
    path.join(root, "lib/mcp/material-tool-service.ts"), {
      "../ideas": {
        getIdea: async (ownerId: string, id: string) => {
          accesses.push({ ownerId, id })
          if (ownerId !== "owner-a" || id !== material.id) throw new errors.NotFoundError("Idea 不存在")
          return material
        },
        searchIdeas: async (ownerId: string, filters: unknown) => { accesses.push({ ownerId, filters }); return [material] },
      },
      "../ideas-validation": ideaSchemas, "../errors": errors,
      "./material-schemas": materialSchemas, "./material-idempotency": idempotency,
      "./approval-service": { createMcpApproval: async (input: unknown) => {
        approvals.push(input)
        return { id: "approval", status: "PENDING_APPROVAL", expiresAt: new Date(1000) }
      } },
      "./tool-service": { runAuthorizedMcpOperation: async (input: {
        context: McpAuthenticatedContext; scope: McpScope; parameterSummary: unknown;
        operation: (credentialId: string) => Promise<{ response: unknown; audit: unknown }>
      }) => {
        if (!input.context.scopes.includes(input.scope)) throw new errors.PermissionError(`credential 缺少 scope：${input.scope}`)
        auditParameters.push(input.parameterSummary)
        const result = await input.operation(input.context.credentialId)
        auditParameters.push(result.audit)
        return result.response
      } },
    })
  return { service, accesses, auditParameters, approvals }
}

test("MCP material reads use OAuth subject and keep raw text out of audit summaries", async () => {
  const { service, accesses, auditParameters } = materialService()
  const result = await service.runMaterialMcpTool(context, config, "read_material", { material_id: "material-a" })
  assert.equal(result.raw_input, "original private raw")
  assert.deepEqual(accesses, [{ ownerId: "owner-a", id: "material-a" }])
  assert.ok(!JSON.stringify(auditParameters).includes("original private raw"))
  await assert.rejects(service.runMaterialMcpTool({ ...context, subject: "owner-b" }, config,
    "read_material", { material_id: "material-a" }), /不存在/)
  await assert.rejects(service.runMaterialMcpTool({ ...context, scopes: ["draft:read"] }, config,
    "read_material", { material_id: "material-a" }), /material:read/)
  await assert.rejects(service.runMaterialMcpTool({ ...context, authType: "static" }, config,
    "read_material", { material_id: "material-a" }), /OAuth/)
})

test("MCP material writes propose approval only and never derive owner identity from inputs", async () => {
  const { service, approvals, auditParameters } = materialService()
  const result = await service.runMaterialMcpTool(context, config, "create_material", {
    raw_input: "todo: preserve this exact private text", source: "chat", request_key: "capture-1",
  })
  assert.equal(result.status, "pending_approval")
  assert.equal(approvals.length, 1)
  const approval = approvals[0] as { payload: { ownerId: string; rawInput: string; requestKey: string }; requestKey: string }
  assert.equal(approval.payload.ownerId, context.subject)
  assert.equal(approval.payload.rawInput, "todo: preserve this exact private text")
  assert.equal(approval.requestKey, "capture-1")
  assert.equal(approval.payload.requestKey, idempotency.materialApprovalId(context.credentialId, "create_material", "capture-1"))
  assert.ok(!JSON.stringify(auditParameters).includes("preserve this exact private text"))
})

test("MCP approval request-key retries return same approval and reject changed payload", async () => {
  const records = new Map<string, Record<string, unknown>>()
  const service = loadRoute<typeof import("../lib/mcp/approval-service")>(path.join(root, "lib/mcp/approval-service.ts"), {
    "zod/v3": { z }, "../db": { prisma: { mcpApproval: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = data.id as string
        if (records.has(id)) throw Object.assign(new Error("unique"), { code: "P2002" })
        const record = { ...data, status: "PENDING_APPROVAL", createdAt: new Date() }
        records.set(id, record)
        return record
      },
      findUnique: async ({ where }: { where: { id: string } }) => records.get(where.id),
    } } },
    "../errors": errors, "../categories": {}, "../posts": {}, "../todos": {}, "../validation": {},
    "./audit-service": {}, "./credential-service": {}, "./deletion-policy": {}, "./material-idempotency": idempotency,
  })
  const input = { credentialId: "agent-a", toolName: "create_material", requiredScope: "material:write" as const,
    payload: { kind: "create_material" as const, ownerId: "owner-a", rawInput: "exact original", requestKey: "capture-1" },
    parameterSummary: { characterCount: 14 }, ttlHours: 24, requestKey: "capture-1" }
  const first = await service.createMcpApproval(input)
  const replay = await service.createMcpApproval(input)
  assert.equal(first.id, replay.id)
  assert.equal(records.size, 1)
  await assert.rejects(service.createMcpApproval({ ...input, payload: { ...input.payload, rawInput: "different" } }), /request_key/)
  assert.equal(records.size, 1)
})

for (const status of ["PENDING_APPROVAL", "APPROVED", "REJECTED"]) {
  test(`material approvals reject another actor before state handling (${status})`, async () => {
    const approval = { id: "private-approval", status,
      payload: { kind: "create_material", ownerId: "owner-a", rawInput: "private raw", requestKey: "capture-1" } }
    let writes = 0
    const service = loadRoute<typeof import("../lib/mcp/approval-service")>(path.join(root, "lib/mcp/approval-service.ts"), {
      "zod/v3": { z }, "../db": { prisma: { mcpApproval: {
        findUnique: async () => approval, findFirst: async () => approval,
        updateMany: async () => { writes += 1; return { count: 1 } },
      } } },
      "../errors": errors, "../categories": {}, "../posts": {}, "../todos": {}, "../validation": {},
      "./audit-service": {}, "./credential-service": {}, "./deletion-policy": {},
    })
    for (const actor of [undefined, "owner-b"]) {
      await assert.rejects(service.approveMcpApproval(approval.id, actor), /不存在/)
      await assert.rejects(service.rejectMcpApproval(approval.id, undefined, actor), /不存在/)
      await assert.rejects(service.deleteMcpApproval(approval.id, actor), /不存在/)
    }
    await assert.rejects(service.getMcpMaterialApprovalProposal(approval.id, "owner-b"), /不存在/)
    const preview = await service.getMcpMaterialApprovalProposal(approval.id, "owner-a")
    assert.equal(preview.proposal.rawInput, "private raw")
    assert.equal("ownerId" in preview.proposal, false)
    assert.equal(writes, 0)
  })
}
