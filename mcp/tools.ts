import path from "path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { resolveBlogCategory } from "../lib/categories"
import { extractPlainText } from "../lib/content"
import { AppError } from "../lib/errors"
import { prepareMarkdownImport } from "../lib/markdown-import"
import { assertDraftMetadataTarget, searchPosts } from "../lib/posts"
import { getTodoForDraft } from "../lib/todos"
import { validateCategoryCreate, validatePostUpdate } from "../lib/validation"
import { createMcpApproval } from "../lib/mcp/approval-service"
import { errorDetails, recordMcpAudit } from "../lib/mcp/audit-service"
import type { McpRuntimeConfig } from "../lib/mcp/config"
import {
  authenticateMcpCredential,
  mcpCredentialId,
  requireMcpScope,
  type McpScope,
} from "../lib/mcp/credential-service"
import { consumeMcpRateLimit } from "../lib/mcp/rate-limit-service"

interface OperationResult {
  response: Record<string, unknown>
  audit: Record<string, unknown>
}

function toolResult(value: Record<string, unknown>, isError = false): CallToolResult {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  }
}

function safeToolError(error: unknown) {
  const details = errorDetails(error)
  if (!(error instanceof AppError)) console.error("[MCP tool error]", error)
  return { error: error instanceof AppError ? details.message : "MCP tool 执行失败", code: details.code }
}

async function invokeTool(input: {
  config: McpRuntimeConfig
  toolName: string
  scope: McpScope
  write: boolean
  parameterSummary: Record<string, unknown>
  operation: (credentialId: string) => Promise<OperationResult>
}): Promise<CallToolResult> {
  let credentialId: string | null = null
  try {
    credentialId = mcpCredentialId(input.config.credential)
    const credential = await authenticateMcpCredential(input.config.credential)
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
    return toolResult(result.response)
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
    return toolResult(safeToolError(error), true)
  }
}

const metadataUpdateSchema = z.object({
  post_id: z.string().min(1).max(128).describe("草稿 ID"),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  category: z.string().min(1).max(128).nullable().optional().describe("博客分区 ID 或名称，null 表示清除"),
  cover: z.string().max(255).nullable().optional().describe("/uploads/ 下的站内图片路径，null 表示清除"),
  draft_metadata: z.record(z.unknown()).nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "post_id"), {
  message: "至少提供一个要修改的 metadata 字段",
})

export function createBlogMcpServer(config: McpRuntimeConfig) {
  const server = new McpServer(
    { name: "qz-blog-drafts", version: "1.0.0" },
    {
      instructions: [
        "This server only transports and manages owner-authored blog drafts.",
        "It never writes article body text, publishes posts, or deletes data.",
        "All write tools create a pending approval; a human must approve it with the local admin CLI.",
      ].join(" "),
    }
  )

  server.registerTool("create_draft_from_markdown", {
    title: "导入本地 Markdown 草稿",
    description: "校验沙箱内的 Markdown 和本地图片，并创建待人工审批的草稿导入请求。不会生成正文或直接写入文章。",
    inputSchema: z.object({
      local_path: z.string().min(1).max(2048).describe("MCP_MARKDOWN_ROOT 内的 .md/.markdown 文件路径"),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ local_path }) => invokeTool({
    config,
    toolName: "create_draft_from_markdown",
    scope: "draft:create",
    write: true,
    parameterSummary: { sourceFile: path.basename(local_path) },
    operation: async (credentialId) => {
      const prepared = await prepareMarkdownImport(local_path, config)
      const approval = await createMcpApproval({
        credentialId,
        toolName: "create_draft_from_markdown",
        requiredScope: "draft:create",
        payload: prepared.payload,
        parameterSummary: prepared.summary,
        ttlHours: config.approvalTtlHours,
      })
      const response = {
        status: "pending_approval",
        approval_id: approval.id,
        expires_at: approval.expiresAt.toISOString(),
        draft: prepared.summary,
      }
      return { response, audit: { approvalId: approval.id, status: "pending_approval" } }
    },
  }))

  server.registerTool("search_drafts", {
    title: "搜索博客文章与草稿",
    description: "按标题、正文关键词、标签、分区和状态搜索；默认只查草稿，返回 metadata 和短摘要，不返回完整正文。",
    inputSchema: z.object({
      title: z.string().max(200).optional(),
      keyword: z.string().max(200).optional(),
      tag: z.string().max(50).optional(),
      category: z.string().max(128).optional().describe("分区 ID 或名称"),
      status: z.enum(["DRAFT", "PUBLISHED", "ALL"]).default("DRAFT"),
      limit: z.number().int().min(1).max(100).default(20),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invokeTool({
    config,
    toolName: "search_drafts",
    scope: "draft:read",
    write: false,
    parameterSummary: {
      filters: {
        title: args.title,
        keyword: args.keyword,
        tag: args.tag,
        category: args.category,
        status: args.status,
        limit: args.limit,
      },
    },
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
  }))

  server.registerTool("update_draft_metadata", {
    title: "修改草稿 metadata",
    description: "创建待人工审批的 metadata 修改请求。只能修改草稿标题、描述、标签、分区、封面和 draft metadata，不能修改正文。",
    inputSchema: metadataUpdateSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invokeTool({
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
      const input = validatePostUpdate({
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
        payload: { kind: "update_draft_metadata", postId: args.post_id, input },
        parameterSummary: {
          postId: target.id,
          currentTitle: target.title,
          fields: Object.keys(input),
        },
        ttlHours: config.approvalTtlHours,
      })
      return {
        response: {
          status: "pending_approval",
          approval_id: approval.id,
          expires_at: approval.expiresAt.toISOString(),
          post_id: target.id,
        },
        audit: { approvalId: approval.id, status: "pending_approval", postId: target.id },
      }
    },
  }))

  server.registerTool("create_category", {
    title: "创建分区",
    description: "创建待人工审批的博客或 Todo 分区请求。",
    inputSchema: z.object({
      name: z.string().min(1).max(80),
      type: z.enum(["BLOG", "TODO"]).default("BLOG"),
      description: z.string().max(500).nullable().optional(),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
      sort_order: z.number().int().min(-10_000).max(10_000).default(0),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invokeTool({
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
        response: {
          status: "pending_approval",
          approval_id: approval.id,
          expires_at: approval.expiresAt.toISOString(),
        },
        audit: { approvalId: approval.id, status: "pending_approval" },
      }
    },
  }))

  server.registerTool("todo_to_draft", {
    title: "Todo 转博客草稿",
    description: "创建待人工审批的 Todo 转草稿请求；只搬运 Todo 中已有标题和描述，不生成正文。",
    inputSchema: z.object({
      todo_id: z.string().min(1).max(128),
      mark_done: z.boolean().default(false),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invokeTool({
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
        response: {
          status: "pending_approval",
          approval_id: approval.id,
          expires_at: approval.expiresAt.toISOString(),
          todo_id: todo.id,
        },
        audit: { approvalId: approval.id, status: "pending_approval", todoId: todo.id },
      }
    },
  }))

  return server
}
