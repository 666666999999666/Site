import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  createCategoryInputSchema,
  createDraftFromMarkdownInputSchema,
  searchDraftsInputSchema,
  todoToDraftInputSchema,
  updateDraftMetadataInputSchema,
  type McpToolInputMap,
  type McpToolName,
} from "../lib/mcp/tool-schemas"

export type McpToolInvoker = <Name extends McpToolName>(
  name: Name,
  input: McpToolInputMap[Name]
) => Promise<CallToolResult>

export function createRegisteredBlogMcpServer(invoke: McpToolInvoker) {
  const server = new McpServer(
    { name: "qz-blog-drafts", version: "1.1.0" },
    {
      instructions: [
        "This server only transports and manages owner-authored blog drafts.",
        "It never generates article body text, publishes posts, or deletes data.",
        "All write tools create a pending approval that must be approved in the blog admin UI.",
      ].join(" "),
    }
  )

  server.registerTool("create_draft_from_markdown", {
    title: "导入本地 Markdown 草稿",
    description: "校验允许目录内的 Markdown 和本地图片，并创建待人工审批的线上草稿导入请求。不会生成正文或直接发布文章。",
    inputSchema: createDraftFromMarkdownInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("create_draft_from_markdown", args))

  server.registerTool("search_drafts", {
    title: "搜索博客文章与草稿",
    description: "按标题、正文关键词、标签、分区和状态搜索；默认只查草稿，只返回 metadata 和短摘要。",
    inputSchema: searchDraftsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("search_drafts", args))

  server.registerTool("update_draft_metadata", {
    title: "修改草稿 metadata",
    description: "创建待人工审批的 metadata 修改请求，只允许修改草稿元数据，不能修改正文。",
    inputSchema: updateDraftMetadataInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("update_draft_metadata", args))

  server.registerTool("create_category", {
    title: "创建分区",
    description: "创建待人工审批的博客或 Todo 分区请求。",
    inputSchema: createCategoryInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("create_category", args))

  server.registerTool("todo_to_draft", {
    title: "Todo 转博客草稿",
    description: "创建待人工审批的 Todo 转草稿请求，只搬运 Todo 已有内容，不生成正文。",
    inputSchema: todoToDraftInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("todo_to_draft", args))

  return server
}
