import { resolveBlogCategory } from "../categories"
import { extractPlainText } from "../content"
import { assertDraftMetadataTarget, searchPosts } from "../posts"
import { getTodoForDraft } from "../todos"
import { validateCategoryCreate, validatePostUpdate } from "../validation"
import { createMcpApproval, getMcpApprovalStatus } from "./approval-service"
import {
  beginMcpAudit,
  completeMcpAuditFailure,
  completeMcpAuditSuccess,
} from "./audit-service"
import type { McpAuthenticatedContext } from "./auth-context"
import type { McpSecurityConfig } from "./config"
import { requireMcpScope, type McpScope } from "./credential-service"
import { consumeMcpRateLimit } from "./rate-limit-service"
import {
  createCategoryInputSchema,
  getApprovalStatusInputSchema,
  searchDraftsInputSchema,
  todoToDraftInputSchema,
  updateDraftMetadataInputSchema,
  type McpToolInputMap,
} from "./tool-schemas"

export async function runAuthorizedMcpOperation<T>(input: {
  context: McpAuthenticatedContext
  config: McpSecurityConfig
  toolName: string
  scope: McpScope | null
  write: boolean
  parameterSummary: Record<string, unknown>
  operation: (credentialId: string) => Promise<{ response: T; audit: Record<string, unknown> }>
}): Promise<T> {
  const audit = await beginMcpAudit({
    credentialId: input.context.credentialId,
    toolName: input.toolName,
    parameterSummary: input.parameterSummary,
  })
  try {
    if (input.scope !== null) requireMcpScope(input.context, input.scope)
    await consumeMcpRateLimit({
      credentialId: input.context.credentialId,
      toolName: input.toolName,
      credentialLimit: input.config.credentialRateLimit,
      toolLimit: input.write ? input.config.writeRateLimit : input.config.searchRateLimit,
    })
    const result = await input.operation(input.context.credentialId)
    await completeMcpAuditSuccess(audit.id, result.audit).catch((auditError) => {
      console.error("[MCP audit completion failure]", auditError)
    })
    return result.response
  } catch (error) {
    await completeMcpAuditFailure(audit.id, error).catch((auditError) => {
      console.error("[MCP audit failure]", auditError)
    })
    throw error
  }
}

function approvalResponse(approval: { id: string; expiresAt: Date }, extra: Record<string, unknown> = {}) {
  return {
    status: "pending_approval",
    approval_id: approval.id,
    expires_at: approval.expiresAt.toISOString(),
    ...extra,
  }
}

function metadataPreview(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  const serialized = JSON.stringify(value)
  return serialized.length <= 500 ? value : `${serialized.slice(0, 500)}…`
}

async function runSearchDrafts(context: McpAuthenticatedContext, config: McpSecurityConfig, rawInput: unknown) {
  const args = searchDraftsInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context,
    config,
    toolName: "search_drafts",
    scope: "draft:read",
    write: false,
    parameterSummary: { filters: args },
    operation: async () => {
      const posts = await searchPosts({
        title: args.title,
        keyword: args.keyword,
        tag: args.tag,
        category: args.category,
        status: args.status,
        take: args.limit,
      })
      const results = posts.map((post) => ({
        id: post.id,
        title: post.title,
        description: post.excerpt,
        slug: post.slug,
        tags: post.tags,
        category: post.category ? { id: post.category.id, name: post.category.name } : null,
        cover: post.coverImage,
        draft_metadata: post.draftMetadata,
        status: post.status,
        snippet: extractPlainText(post.content).replace(/\s+/g, " ").trim().slice(0, 240),
        created_at: post.createdAt.toISOString(),
        updated_at: post.updatedAt.toISOString(),
      }))
      return {
        response: { count: results.length, results },
        audit: { count: results.length, postIds: results.map((post) => post.id) },
      }
    },
  })
}

async function runUpdateDraftMetadata(context: McpAuthenticatedContext, config: McpSecurityConfig, rawInput: unknown) {
  const args = updateDraftMetadataInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context,
    config,
    toolName: "update_draft_metadata",
    scope: "draft:update",
    write: true,
    parameterSummary: {
      postId: args.post_id,
      proposed: {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.category !== undefined ? { category: args.category } : {}),
        ...(args.cover !== undefined ? { cover: args.cover } : {}),
        ...(args.draft_metadata !== undefined
          ? { draftMetadataPreview: metadataPreview(args.draft_metadata) }
          : {}),
      },
    },
    operation: async (credentialId) => {
      const target = await assertDraftMetadataTarget(args.post_id)
      const categoryId = args.category === undefined
        ? undefined
        : await resolveBlogCategory(args.category)
      const postInput = validatePostUpdate({
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { excerpt: args.description } : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.category !== undefined ? { categoryId } : {}),
        ...(args.cover !== undefined ? { coverImage: args.cover } : {}),
        ...(args.draft_metadata !== undefined ? { draftMetadata: args.draft_metadata } : {}),
      })
      const approval = await createMcpApproval({
        credentialId,
        toolName: "update_draft_metadata",
        requiredScope: "draft:update",
        payload: { kind: "update_draft_metadata", postId: args.post_id, input: postInput },
        parameterSummary: {
          postId: target.id,
          currentTitle: target.title,
          proposed: {
            ...(postInput.title !== undefined ? { title: postInput.title } : {}),
            ...(postInput.excerpt !== undefined ? { description: postInput.excerpt } : {}),
            ...(postInput.tags !== undefined ? { tags: postInput.tags } : {}),
            ...(postInput.categoryId !== undefined ? { categoryId: postInput.categoryId } : {}),
            ...(postInput.coverImage !== undefined ? { cover: postInput.coverImage } : {}),
            ...(postInput.draftMetadata !== undefined
              ? { draftMetadataPreview: metadataPreview(postInput.draftMetadata) }
              : {}),
          },
        },
        ttlHours: config.approvalTtlHours,
      })
      return {
        response: approvalResponse(approval, { post_id: target.id }),
        audit: { approvalId: approval.id, status: "pending_approval", postId: target.id },
      }
    },
  })
}

async function runCreateCategory(context: McpAuthenticatedContext, config: McpSecurityConfig, rawInput: unknown) {
  const args = createCategoryInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context,
    config,
    toolName: "create_category",
    scope: "category:create",
    write: true,
    parameterSummary: {
      name: args.name,
      type: args.type,
      description: args.description ?? null,
      color: args.color ?? null,
      sortOrder: args.sort_order ?? 0,
    },
    operation: async (credentialId) => {
      const category = validateCategoryCreate({
        name: args.name,
        type: args.type,
        description: args.description,
        color: args.color,
        sortOrder: args.sort_order,
      })
      const approval = await createMcpApproval({
        credentialId,
        toolName: "create_category",
        requiredScope: "category:create",
        payload: { kind: "create_category", input: category },
        parameterSummary: {
          name: category.name,
          type: category.type,
          description: category.description ?? null,
          color: category.color ?? null,
          sortOrder: category.sortOrder ?? 0,
        },
        ttlHours: config.approvalTtlHours,
      })
      return {
        response: approvalResponse(approval),
        audit: { approvalId: approval.id, status: "pending_approval" },
      }
    },
  })
}

async function runTodoToDraft(context: McpAuthenticatedContext, config: McpSecurityConfig, rawInput: unknown) {
  const args = todoToDraftInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context,
    config,
    toolName: "todo_to_draft",
    scope: "todo:convert",
    write: true,
    parameterSummary: { todoId: args.todo_id, markDone: args.mark_done },
    operation: async (credentialId) => {
      const todo = await getTodoForDraft(args.todo_id)
      const approval = await createMcpApproval({
        credentialId,
        toolName: "todo_to_draft",
        requiredScope: "todo:convert",
        payload: { kind: "todo_to_draft", todoId: todo.id, markDone: args.mark_done },
        parameterSummary: { todoId: todo.id, title: todo.title, markDone: args.mark_done },
        ttlHours: config.approvalTtlHours,
      })
      return {
        response: approvalResponse(approval, { todo_id: todo.id }),
        audit: { approvalId: approval.id, status: "pending_approval", todoId: todo.id },
      }
    },
  })
}

async function runGetApprovalStatus(context: McpAuthenticatedContext, config: McpSecurityConfig, rawInput: unknown) {
  const args = getApprovalStatusInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    context,
    config,
    toolName: "get_approval_status",
    scope: null,
    write: false,
    parameterSummary: { approvalId: args.approval_id },
    operation: async (credentialId) => {
      const approval = await getMcpApprovalStatus(args.approval_id, credentialId)
      return {
        response: approval,
        audit: {
          approvalId: approval.approval_id,
          status: approval.status,
          postId: approval.post_id,
        },
      }
    },
  })
}

export type GatewayMcpToolName = Exclude<
  keyof McpToolInputMap,
  "begin_markdown_draft_import" | "finalize_markdown_draft_import"
>

export async function runGatewayMcpTool<Name extends GatewayMcpToolName>(
  context: McpAuthenticatedContext,
  config: McpSecurityConfig,
  name: Name,
  input: McpToolInputMap[Name]
): Promise<Record<string, unknown>> {
  switch (name) {
    case "search_drafts":
      return runSearchDrafts(context, config, input)
    case "update_draft_metadata":
      return runUpdateDraftMetadata(context, config, input)
    case "create_category":
      return runCreateCategory(context, config, input)
    case "todo_to_draft":
      return runTodoToDraft(context, config, input)
    case "get_approval_status":
      return runGetApprovalStatus(context, config, input)
  }
}
