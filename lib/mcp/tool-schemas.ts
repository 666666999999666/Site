import { z } from "zod/v3"

const markdownImportImageSchema = z.object({
  reference: z.string().min(1).max(2048)
    .describe("Markdown 中原样出现的本地图片相对引用，例如 ./images/cover.png"),
  digest: z.string().regex(/^[a-f0-9]{64}$/)
    .describe("本地图片原始字节的 SHA-256 小写十六进制摘要"),
  size: z.number().int().min(1).max(5 * 1024 * 1024)
    .describe("本地图片原始字节数，单张最多 5 MiB"),
}).strict()

export const beginMarkdownDraftImportInputSchema = z.object({
  source_file: z.string().min(1).max(255)
    .describe("用户指定 Markdown 文件的文件名，不要传完整本机路径"),
  markdown: z.string().max(2_000_000)
    .describe("从用户文件逐字读取的 Markdown 全文；禁止生成、续写或改写正文"),
  images: z.array(markdownImportImageSchema).max(50)
    .describe("Markdown 本地图片引用、大小与摘要；没有本地图片时传空数组"),
}).strict()

export const finalizeMarkdownDraftImportInputSchema = z.object({
  bundle_id: z.string().uuid().describe("begin_markdown_draft_import 返回的导入会话 ID"),
  upload_token: z.string().min(43).max(128)
    .describe("begin_markdown_draft_import 返回的一次性短期上传票据"),
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

export const getApprovalStatusInputSchema = z.object({
  approval_id: z.string().min(1).max(128).describe("写操作返回的审批 ID"),
}).strict()

export const mcpToolInputSchemas = {
  begin_markdown_draft_import: beginMarkdownDraftImportInputSchema,
  finalize_markdown_draft_import: finalizeMarkdownDraftImportInputSchema,
  search_drafts: searchDraftsInputSchema,
  update_draft_metadata: updateDraftMetadataInputSchema,
  create_category: createCategoryInputSchema,
  todo_to_draft: todoToDraftInputSchema,
  get_approval_status: getApprovalStatusInputSchema,
} as const

export type McpToolName = keyof typeof mcpToolInputSchemas
export type BeginMarkdownDraftImportInput = z.infer<typeof beginMarkdownDraftImportInputSchema>
export type FinalizeMarkdownDraftImportInput = z.infer<typeof finalizeMarkdownDraftImportInputSchema>
export type SearchDraftsInput = z.infer<typeof searchDraftsInputSchema>
export type UpdateDraftMetadataInput = z.infer<typeof updateDraftMetadataInputSchema>
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>
export type TodoToDraftInput = z.infer<typeof todoToDraftInputSchema>
export type GetApprovalStatusInput = z.infer<typeof getApprovalStatusInputSchema>

export interface McpToolInputMap {
  begin_markdown_draft_import: BeginMarkdownDraftImportInput
  finalize_markdown_draft_import: FinalizeMarkdownDraftImportInput
  search_drafts: SearchDraftsInput
  update_draft_metadata: UpdateDraftMetadataInput
  create_category: CreateCategoryInput
  todo_to_draft: TodoToDraftInput
  get_approval_status: GetApprovalStatusInput
}
