import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  beginMarkdownDraftImportInputSchema,
  createCategoryInputSchema,
  createMaterialInputSchema, listMaterialsInputSchema, searchMaterialsInputSchema,
  readMaterialInputSchema, updateMaterialInputSchema, convertMaterialInputSchema,
  finalizeMarkdownDraftImportInputSchema,
  getApprovalStatusInputSchema,
  searchDraftsInputSchema,
  todoToDraftInputSchema,
  updateDraftMetadataInputSchema,
  type McpToolInputMap,
  type McpToolName,
} from "../lib/mcp/tool-schemas"

export type OnlineMcpToolName = McpToolName

export type McpToolInvoker<Names extends McpToolName> = <Name extends Names>(
  name: Name,
  input: McpToolInputMap[Name]
) => Promise<CallToolResult>

function createServer(name: string) {
  return new McpServer(
    { name, version: "1.4.0" },
    {
      instructions: [
        "This server manages owner-authored blog drafts and private materials. Preserve raw material input; discussion does not imply creating a task.",
        "It never generates article body text, publishes posts, or deletes data.",
        "All write tools create a pending approval that must be approved in the blog admin UI.",
      ].join(" "),
    }
  )
}

export function createRegisteredOnlineMcpServer(invoke: McpToolInvoker<OnlineMcpToolName>) {
  const server = createServer("qz-blog-online")

  server.registerTool("begin_markdown_draft_import", {
    title: "准备导入 Markdown 草稿",
    description: "读取用户明确指定的本机 Markdown 与其引用图片信息，创建短期上传会话。必须逐字搬运用户正文，禁止生成、续写或改写内容。返回的图片地址只接受对应原始图片字节。",
    inputSchema: beginMarkdownDraftImportInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("begin_markdown_draft_import", args))

  server.registerTool("finalize_markdown_draft_import", {
    title: "提交 Markdown 草稿导入审批",
    description: "所有本地图片按准备步骤返回的地址上传完成后，校验暂存内容并创建待人工审批的草稿导入请求；不会发布文章。",
    inputSchema: finalizeMarkdownDraftImportInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("finalize_markdown_draft_import", args))

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
    description: "创建待人工审批的 Todo 转草稿请求。需要明确的 todo_id，只搬运 Todo 已有内容，不生成正文。",
    inputSchema: todoToDraftInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => invoke("todo_to_draft", args))

  server.registerTool("get_approval_status", {
    title: "查询审批状态",
    description: "查询当前 credential 发起的审批，返回审批结果、失败原因以及最终 post_id 等业务 ID。",
    inputSchema: getApprovalStatusInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("get_approval_status", args))

  server.registerTool("create_material", {
    title: "保存私人材料",
    description: "逐字保存用户输入和来源，需人工审批；无需前缀，不自动拆分 Todo。重试复用 request_key。",
    inputSchema: createMaterialInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("create_material", args))
  server.registerTool("list_materials", {
    title: "列出私人材料",
    description: "只列出当前 OAuth 所有者的材料，可按暂存、想讨论、已讨论或已归档筛选。",
    inputSchema: listMaterialsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("list_materials", args))
  server.registerTool("search_materials", {
    title: "搜索私人材料",
    description: "按关键词搜索当前所有者的原文、标题、整理内容和讨论摘要，不查询其他所有者材料。",
    inputSchema: searchMaterialsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("search_materials", args))
  server.registerTool("read_material", {
    title: "读取私人材料",
    description: "读取指定材料的原文、来源、采集时间、整理内容、讨论状态和转换关联。",
    inputSchema: readMaterialInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("read_material", args))
  server.registerTool("update_material", {
    title: "更新材料整理与讨论",
    description: "提交人工审批，修改整理内容、讨论状态或摘要；原始输入、来源和采集时间始终不变。",
    inputSchema: updateMaterialInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("update_material", args))
  server.registerTool("convert_material", {
    title: "明确转换材料",
    description: "用户明确决定后，提交一个 Todo 或文章草稿的转换审批；保留材料和双向关联，重试不重复创建。",
    inputSchema: convertMaterialInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => invoke("convert_material", args))

  return server
}
