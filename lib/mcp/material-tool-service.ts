import { getIdea, searchIdeas } from "../ideas"
import { ideaConversionSchema, ideaUpdateSchema, parseIdeaInput } from "../ideas-validation"
import { PermissionError } from "../errors"
import type { McpAuthenticatedContext } from "./auth-context"
import { createMcpApproval } from "./approval-service"
import type { McpSecurityConfig } from "./config"
import { materialApprovalId } from "./material-idempotency"
import {
  createMaterialInputSchema, listMaterialsInputSchema, searchMaterialsInputSchema,
  readMaterialInputSchema, updateMaterialInputSchema, convertMaterialInputSchema,
} from "./material-schemas"
import { runAuthorizedMcpOperation } from "./tool-service"

export type MaterialMcpToolName = "create_material" | "list_materials" | "search_materials"
  | "read_material" | "update_material" | "convert_material"

function ownerId(context: McpAuthenticatedContext) {
  if (context.authType !== "oauth" || !context.subject) {
    throw new PermissionError("私人材料需要明确的 OAuth 所有者身份")
  }
  return context.subject
}

function approvalResponse(approval: { id: string; status: string; expiresAt: Date }) {
  return {
    approval_id: approval.id,
    status: approval.status === "APPROVED" ? "approved" : approval.status === "REJECTED" ? "rejected" : "pending_approval",
    expires_at: approval.expiresAt.toISOString(),
  }
}

export async function runMaterialMcpTool(
  context: McpAuthenticatedContext,
  config: McpSecurityConfig,
  name: MaterialMcpToolName,
  rawInput: unknown
): Promise<Record<string, unknown>> {
  if (name === "list_materials" || name === "search_materials") {
    const args = name === "search_materials"
      ? searchMaterialsInputSchema.parse(rawInput) : listMaterialsInputSchema.parse(rawInput)
    const q = "query" in args && typeof args.query === "string" ? args.query : undefined
    const tag = "tag" in args && typeof args.tag === "string" ? args.tag : undefined
    return runAuthorizedMcpOperation({
      context, config, toolName: name, scope: "material:read", write: false,
      parameterSummary: { hasQuery: !!q, hasTag: !!tag, discussionStatus: args.discussion_status, limit: args.limit },
      operation: async () => {
        const materials = await searchIdeas(ownerId(context), {
          q, tag, discussionStatus: args.discussion_status, take: args.limit + 1,
        })
        const results = materials.slice(0, args.limit).map((material) => ({
          id: material.id, title: material.title, discussion_status: material.discussionStatus,
          discussion_summary: material.discussionSummary, tags: material.tags,
          source: material.source, captured_at: material.capturedAt.toISOString(),
          updated_at: material.updatedAt.toISOString(), href: `/admin/ideas/${encodeURIComponent(material.id)}`,
        }))
        return {
          response: { count: results.length, has_more: materials.length > args.limit, results },
          audit: { count: results.length, materialIds: results.map((material) => material.id) },
        }
      },
    })
  }
  if (name === "read_material") {
    const args = readMaterialInputSchema.parse(rawInput)
    return runAuthorizedMcpOperation({
      context, config, toolName: name, scope: "material:read", write: false,
      parameterSummary: { materialId: args.material_id },
      operation: async () => {
        const material = await getIdea(ownerId(context), args.material_id)
        return {
          response: {
            id: material.id, title: material.title, content: material.content, raw_input: material.rawInput,
            source: material.source, captured_at: material.capturedAt.toISOString(),
            discussion_status: material.discussionStatus, discussion_summary: material.discussionSummary,
            tags: material.tags, conversions: material.conversions,
            created_at: material.createdAt.toISOString(), updated_at: material.updatedAt.toISOString(),
          },
          audit: { materialId: material.id },
        }
      },
    })
  }
  if (name === "create_material") {
    const args = createMaterialInputSchema.parse(rawInput)
    return runAuthorizedMcpOperation({
      context, config, toolName: name, scope: "material:write", write: true,
      parameterSummary: { characterCount: Array.from(args.raw_input).length, hasSource: !!args.source },
      operation: async (credentialId) => {
        const approval = await createMcpApproval({
          credentialId, toolName: name, requiredScope: "material:write", requestKey: args.request_key,
          payload: { kind: name, ownerId: ownerId(context), rawInput: args.raw_input, source: args.source ?? "mcp",
            requestKey: materialApprovalId(credentialId, name, args.request_key) },
          parameterSummary: { characterCount: Array.from(args.raw_input).length, source: args.source ?? "mcp",
            private: true, createsTasks: false },
          ttlHours: config.approvalTtlHours,
        })
        return { response: approvalResponse(approval), audit: { approvalId: approval.id, status: approval.status } }
      },
    })
  }
  if (name === "update_material") {
    const args = updateMaterialInputSchema.parse(rawInput)
    return runAuthorizedMcpOperation({
      context, config, toolName: name, scope: "material:write", write: true,
      parameterSummary: { materialId: args.material_id, changedFields: Object.keys(args.changes) },
      operation: async (credentialId) => {
        const owner = ownerId(context)
        await getIdea(owner, args.material_id)
        const input = parseIdeaInput(ideaUpdateSchema, args.changes)
        const approval = await createMcpApproval({
          credentialId, toolName: name, requiredScope: "material:write", requestKey: args.request_key,
          payload: { kind: name, ownerId: owner, materialId: args.material_id, input },
          parameterSummary: { materialId: args.material_id, changedFields: Object.keys(input),
            ...(input.discussionStatus !== undefined ? { discussionStatus: input.discussionStatus } : {}) },
          ttlHours: config.approvalTtlHours,
        })
        return { response: approvalResponse(approval), audit: { approvalId: approval.id, materialId: args.material_id } }
      },
    })
  }
  const args = convertMaterialInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context, config, toolName: name, scope: "material:convert", write: true,
    parameterSummary: { materialId: args.material_id, targetType: args.conversion.targetType },
    operation: async (credentialId) => {
      const owner = ownerId(context)
      await getIdea(owner, args.material_id)
      const input = parseIdeaInput(ideaConversionSchema, {
        ...args.conversion, requestKey: materialApprovalId(credentialId, name, args.request_key),
      })
      const approval = await createMcpApproval({
        credentialId, toolName: name, requiredScope: "material:convert", requestKey: args.request_key,
        payload: { kind: "convert_material", ownerId: owner, materialId: args.material_id, input },
        parameterSummary: { materialId: args.material_id, targetType: input.targetType, title: input.title,
          createsDraftOnly: input.targetType === "BLOG", preservesMaterial: true },
        ttlHours: config.approvalTtlHours,
      })
      return { response: approvalResponse(approval), audit: { approvalId: approval.id, materialId: args.material_id } }
    },
  })
}
