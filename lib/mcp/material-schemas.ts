import { z } from "zod/v3"
import { ideaConversionSchema, ideaUpdateSchema } from "../ideas-validation"

export const materialRequestKeySchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/)
const materialIdSchema = z.string().min(1).max(128)
const discussionStatusSchema = z.enum(["STORED", "WANT_DISCUSS", "DISCUSSED", "ARCHIVED"])

export const createMaterialInputSchema = z.object({
  raw_input: z.string().refine((value) => value.trim().length > 0, "原文不能为空")
    .refine((value) => Array.from(value).length <= 100_000, "原文不能超过 100,000 个字符")
    .describe("逐字保留用户提供的材料；即使含 todo: 或文章: 前缀也只存为私人材料，不拆成任务"),
  source: z.string().trim().min(1).max(200).optional().describe("简短来源说明，不填写令牌或凭据"),
  request_key: materialRequestKeySchema.describe("同一次写入重试必须复用；修改内容必须用新 key"),
}).strict()

export const listMaterialsInputSchema = z.object({
  discussion_status: discussionStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).strict()

export const searchMaterialsInputSchema = listMaterialsInputSchema.extend({
  query: z.string().trim().min(1).max(200),
  tag: z.string().trim().min(1).max(50).optional(),
}).strict()

export const readMaterialInputSchema = z.object({ material_id: materialIdSchema }).strict()

export const updateMaterialInputSchema = z.object({
  material_id: materialIdSchema,
  request_key: materialRequestKeySchema,
  changes: ideaUpdateSchema.describe("编辑整理内容、讨论状态或摘要；原文、来源和采集时间不可修改"),
}).strict()

const [blogConversionSchema, todoConversionSchema] = ideaConversionSchema.options
export const convertMaterialInputSchema = z.object({
  material_id: materialIdSchema,
  request_key: materialRequestKeySchema,
  conversion: z.discriminatedUnion("targetType", [
    blogConversionSchema.omit({ requestKey: true }),
    todoConversionSchema.omit({ requestKey: true }),
  ]).describe("用户明确选择的一个 Todo 或文章草稿；不会发布、完成任务或删除原材料"),
}).strict()
