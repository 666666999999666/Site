import path from "path"
import { resolveBlogCategory } from "../categories"
import { extractPlainText } from "../content"
import { prepareMarkdownImport, type MarkdownImportPayload } from "../markdown-import"
import { assertDraftMetadataTarget, searchPosts } from "../posts"
import { getTodoForDraft } from "../todos"
import { validateCategoryCreate, validatePostUpdate } from "../validation"
import { createMcpApproval } from "./approval-service"
import { recordMcpAudit } from "./audit-service"
import type { McpRuntimeConfig, McpSecurityConfig } from "./config"
import {
  authenticateMcpCredential,
  mcpCredentialId,
  requireMcpScope,
  type McpScope,
} from "./credential-service"
import { consumeMcpRateLimit } from "./rate-limit-service"
import {
  createCategoryInputSchema,
  createDraftFromMarkdownInputSchema,
  searchDraftsInputSchema,
  todoToDraftInputSchema,
  updateDraftMetadataInputSchema,
  type McpToolInputMap,
  type McpToolName,
} from "./tool-schemas"

export async function runAuthorizedMcpOperation<T>(input: {
  credentialToken: string
  config: McpSecurityConfig
  toolName: string
  scope: McpScope
  write: boolean
  parameterSummary: Record<string, unknown>
  operation: (credentialId: string) => Promise<{ response: T; audit: Record<string, unknown> }>
}): Promise<T> {
  let credentialId: string | null = null
  try {
    credentialId = mcpCredentialId(input.credentialToken)
    const credential = await authenticateMcpCredential(input.credentialToken)
    requireMcpScope(credential, input.scope)
    await consumeMcpRateLimit({
      credentialId: credential.id,
      toolName: input.toolName,
      credentialLimit: input.config.credentialRateLimit,
      toolLimit: input.write ? input.config.writeRateLimit : input.config.searchRateLimit,
    })
    const result = await input.operation(credential.id)
    await recordMcpAudit({
      credentialId: credential.id,
      toolName: input.toolName,
      parameterSummary: input.parameterSummary,
      resultSummary: result.audit,
      success: true,
    })
    return result.response
  } catch (error) {
    try {
      await recordMcpAudit({
        credentialId,
        toolName: input.toolName,
        parameterSummary: input.parameterSummary,
        success: false,
        error,
      })
    } catch (auditError) {
      console.error("[MCP audit failure]", auditError)
    }
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

export async function requestPreparedMarkdownApproval(input: {
  credentialToken: string
  config: McpSecurityConfig
  payload: MarkdownImportPayload
  summary: {
    sourceFile: string
    title: string
    category: string | null
    tags: string[]
    imageCount: number
    sourceDigest: string
  }
}) {
  return runAuthorizedMcpOperation({
    credentialToken: input.credentialToken,
    config: input.config,
    toolName: "create_draft_from_markdown",
    scope: "draft:create",
    write: true,
    parameterSummary: input.summary,
    operation: async (credentialId) => {
      const approval = await createMcpApproval({
        credentialId,
        toolName: "create_draft_from_markdown",
        requiredScope: "draft:create",
        payload: input.payload,
        parameterSummary: input.summary,
        ttlHours: input.config.approvalTtlHours,
      })
      return {
        response: approvalResponse(approval, { draft: input.summary }),
        audit: { approvalId: approval.id, status: "pending_approval" },
      }
    },
  })
}

async function runCreateDraftFromMarkdown(config: McpRuntimeConfig, rawInput: unknown) {
  const args = createDraftFromMarkdownInputSchema.parse(rawInput)
  const prepared = await prepareMarkdownImport(args.local_path, config)
  return requestPreparedMarkdownApproval({
    credentialToken: config.credential,
    config,
    payload: prepared.payload,
    summary: prepared.summary,
  })
}

async function runSearchDrafts(config: McpSecurityConfig, rawInput: unknown) {
  const args = searchDraftsInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    credentialToken: config.credential,
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

async function runUpdateDraftMetadata(config: McpSecurityConfig, rawInput: unknown) {
  const args = updateDraftMetadataInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    credentialToken: config.credential,
    config,
    toolName: "update_draft_metadata",
    scope: "draft:update",
    write: true,
    parameterSummary: {
      postId: args.post_id,
      fields: Object.keys(args).filter((key) => key !== "post_id"),
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
          fields: Object.keys(postInput),
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

async function runCreateCategory(config: McpSecurityConfig, rawInput: unknown) {
  const args = createCategoryInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    credentialToken: config.credential,
    config,
    toolName: "create_category",
    scope: "category:create",
    write: true,
    parameterSummary: { name: args.name, type: args.type },
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
        parameterSummary: { name: category.name, type: category.type },
        ttlHours: config.approvalTtlHours,
      })
      return {
        response: approvalResponse(approval),
        audit: { approvalId: approval.id, status: "pending_approval" },
      }
    },
  })
}

async function runTodoToDraft(config: McpSecurityConfig, rawInput: unknown) {
  const args = todoToDraftInputSchema.parse(rawInput)
  return runAuthorizedMcpOperation({
    credentialToken: config.credential,
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

export async function runLocalMcpTool<Name extends McpToolName>(
  config: McpRuntimeConfig,
  name: Name,
  input: McpToolInputMap[Name]
): Promise<Record<string, unknown>> {
  switch (name) {
    case "create_draft_from_markdown":
      return runCreateDraftFromMarkdown(config, input)
    case "search_drafts":
      return runSearchDrafts(config, input)
    case "update_draft_metadata":
      return runUpdateDraftMetadata(config, input)
    case "create_category":
      return runCreateCategory(config, input)
    case "todo_to_draft":
      return runTodoToDraft(config, input)
  }
}

export type GatewayMcpToolName = Exclude<McpToolName, "create_draft_from_markdown">

export async function runGatewayMcpTool<Name extends GatewayMcpToolName>(
  config: McpSecurityConfig,
  name: Name,
  input: McpToolInputMap[Name]
): Promise<Record<string, unknown>> {
  switch (name) {
    case "search_drafts":
      return runSearchDrafts(config, input)
    case "update_draft_metadata":
      return runUpdateDraftMetadata(config, input)
    case "create_category":
      return runCreateCategory(config, input)
    case "todo_to_draft":
      return runTodoToDraft(config, input)
  }
}

export function sourceFileSummary(localPath: string) {
  return { sourceFile: path.basename(localPath) }
}
