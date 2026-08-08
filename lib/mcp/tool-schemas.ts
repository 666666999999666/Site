import { z } from "zod"

export const createDraftFromMarkdownInputSchema = z.object({
  local_path: z.string().min(1).max(2048).describe("MCP_MARKDOWN_ROOT 内的 .md/.markdown 文件路径"),
}).strict()

export const searchDraftsInputSchema = z.object({
  title: z.string().max(200).optional(),
  keyword: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  category: z.string().max(128).optional().describe("分区 ID 或名称"),
  status: z.enum(["DRAFT", "PUBLISHED", "ALL"]).default("DRAFT"),
  limit: z.number().int().min(1).max(100).default(20),
}).strict()

export const updateDraftMetadataInputSchema = z.object({
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

export const createCategoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["BLOG", "TODO"]).default("BLOG"),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0),
}).strict()

export const todoToDraftInputSchema = z.object({
  todo_id: z.string().min(1).max(128),
  mark_done: z.boolean().default(false),
}).strict()

export const mcpToolInputSchemas = {
  create_draft_from_markdown: createDraftFromMarkdownInputSchema,
  search_drafts: searchDraftsInputSchema,
  update_draft_metadata: updateDraftMetadataInputSchema,
  create_category: createCategoryInputSchema,
  todo_to_draft: todoToDraftInputSchema,
} as const

export type McpToolName = keyof typeof mcpToolInputSchemas
export type CreateDraftFromMarkdownInput = z.infer<typeof createDraftFromMarkdownInputSchema>
export type SearchDraftsInput = z.infer<typeof searchDraftsInputSchema>
export type UpdateDraftMetadataInput = z.infer<typeof updateDraftMetadataInputSchema>
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>
export type TodoToDraftInput = z.infer<typeof todoToDraftInputSchema>

export interface McpToolInputMap {
  create_draft_from_markdown: CreateDraftFromMarkdownInput
  search_drafts: SearchDraftsInput
  update_draft_metadata: UpdateDraftMetadataInput
  create_category: CreateCategoryInput
  todo_to_draft: TodoToDraftInput
}
