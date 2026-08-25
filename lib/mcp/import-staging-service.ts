import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto"
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises"
import path from "path"
import { z } from "zod/v3"
import { resolveBlogCategory } from "../categories"
import { prisma } from "../db"
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../errors"
import { Prisma } from "../generated/prisma/client"
import { mcpResourceUrl } from "../auth/oauth-config"
import {
  MAX_MARKDOWN_BYTES,
  markdownLocalImageReferences,
  parseMarkdownDraft,
  rewriteMarkdownImageReferences,
} from "../markdown-import"
import { detectImageExtension, storeImageBuffer, uploadDirectory, uploadFilePath } from "../uploads"
import { validatePostCreate } from "../validation"
import { createMcpApproval } from "./approval-service"
import type { McpSecurityConfig } from "./config"
import type { McpAuthenticatedContext } from "./auth-context"
import { runAuthorizedMcpOperation } from "./tool-service"
import { beginMarkdownDraftImportInputSchema } from "./tool-schemas"

const MAX_REMOTE_IMPORT_IMAGES = 50
const MAX_REMOTE_IMPORT_IMAGE_BYTES = 50 * 1024 * 1024
const BUNDLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const remoteImageSchema = beginMarkdownDraftImportInputSchema.shape.images.element
export const remoteImportInitSchema = beginMarkdownDraftImportInputSchema

const storedManifestSchema = z.object({
  summary: z.object({
    sourceFile: z.string(),
    title: z.string(),
    category: z.string().nullable(),
    tags: z.array(z.string()),
    imageCount: z.number().int(),
    sourceDigest: z.string(),
  }).strict(),
  images: z.array(remoteImageSchema.extend({ index: z.number().int().min(0) }).strict()),
}).strict()

type StoredManifest = z.infer<typeof storedManifestSchema>

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function stagingRoot(): string {
  return path.join(uploadDirectory(), ".mcp-staging")
}

function bundleDirectory(id: string): string {
  if (!BUNDLE_ID_PATTERN.test(id)) throw new ValidationError("MCP 导入会话 ID 无效")
  return path.join(stagingRoot(), id.toLowerCase())
}

function sourcePath(id: string): string {
  return path.join(bundleDirectory(id), "source.md")
}

function imagePath(id: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_REMOTE_IMPORT_IMAGES) {
    throw new ValidationError("MCP 导入图片序号无效")
  }
  return path.join(bundleDirectory(id), `${index}.bin`)
}

function uploadTokenMatches(token: string, encodedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const actual = Buffer.from(sha256(token), "hex")
  const expected = Buffer.from(encodedHash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function normalizedSourceFile(value: string): string {
  const filename = path.posix.basename(value.trim().replace(/\\/g, "/"))
  if (!filename || !/\.md(?:own)?$/i.test(filename)) {
    throw new ValidationError("只允许上传 .md 或 .markdown 文件")
  }
  return filename
}

function validatedManifest(input: z.infer<typeof remoteImportInitSchema>, sourceBuffer: Buffer): StoredManifest {
  if (sourceBuffer.length > MAX_MARKDOWN_BYTES) throw new ValidationError("Markdown 文件不能超过 2MB")
  const sourceDigest = sha256(sourceBuffer)
  const sourceFile = normalizedSourceFile(input.source_file)
  const draft = parseMarkdownDraft(sourceFile, sourceBuffer.toString("utf8"))
  const expectedReferences = markdownLocalImageReferences(draft)
  const providedReferences = input.images.map((image) => image.reference)
  if (new Set(providedReferences).size !== providedReferences.length) {
    throw new ValidationError("本地图片引用不能重复")
  }
  if (JSON.stringify(expectedReferences) !== JSON.stringify([...providedReferences].sort((a, b) => a.localeCompare(b, "en")))) {
    throw new ValidationError("Markdown 本地图片清单不匹配")
  }
  const totalBytes = input.images.reduce((sum, image) => sum + image.size, 0)
  if (totalBytes > MAX_REMOTE_IMPORT_IMAGE_BYTES) {
    throw new ValidationError("单次 Markdown 导入的本地图片总大小不能超过 50MB")
  }
  return {
    summary: {
      sourceFile,
      title: draft.title,
      category: draft.categoryReference,
      tags: draft.tags,
      imageCount: input.images.length,
      sourceDigest,
    },
    images: [...input.images]
      .sort((left, right) => left.reference.localeCompare(right.reference, "en"))
      .map((image, index) => ({ ...image, index })),
  }
}

async function removeBundleFiles(id: string) {
  await rm(bundleDirectory(id), { recursive: true, force: true })
}

export async function createRemoteImportBundle(input: {
  context: McpAuthenticatedContext
  config: McpSecurityConfig
  value: unknown
}) {
  return runAuthorizedMcpOperation({
    context: input.context,
    config: input.config,
    toolName: "begin_markdown_draft_import",
    scope: "draft:import",
    write: true,
    parameterSummary: { action: "prepare_remote_markdown_import" },
    operation: async (credentialId) => {
      const parsedResult = remoteImportInitSchema.safeParse(input.value)
      if (!parsedResult.success) {
        throw new ValidationError(parsedResult.error.issues[0]?.message ?? "MCP Markdown 导入参数无效")
      }
      const parsed = parsedResult.data
      const sourceBuffer = Buffer.from(parsed.markdown, "utf8")
      const manifest = validatedManifest(parsed, sourceBuffer)
      const id = randomUUID()
      const uploadToken = randomBytes(32).toString("base64url")
      const expiresAt = new Date(Date.now() + input.config.importUploadTtlMinutes * 60 * 1000)
      const directory = bundleDirectory(id)
      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id" FROM "McpCredential" WHERE "id" = ${credentialId} FOR UPDATE
          `
          const pending = await transaction.mcpImportBundle.count({
            where: {
              credentialId,
              approvalId: null,
              cleanedAt: null,
              expiresAt: { gt: new Date() },
            },
          })
          if (pending >= 3) {
            throw new ConflictError("该 MCP credential 已有 3 个未提交的导入会话")
          }

          await mkdir(stagingRoot(), { recursive: true })
          await mkdir(directory, { mode: 0o700 })
          await writeFile(sourcePath(id), sourceBuffer, { flag: "wx", mode: 0o600 })
          await transaction.mcpImportBundle.create({
            data: {
              id,
              credentialId,
              sourceFile: manifest.summary.sourceFile,
              sourceDigest: manifest.summary.sourceDigest,
              manifest: jsonValue(manifest),
              uploadTokenHash: sha256(uploadToken),
              expiresAt,
            },
          })
        })
      } catch (error) {
        await removeBundleFiles(id)
        throw error
      }
      return {
        response: {
          bundle_id: id,
          upload_token: uploadToken,
          image_count: manifest.images.length,
          expires_at: expiresAt.toISOString(),
          upload_header: "X-MCP-Upload-Token",
          uploads: manifest.images.map((image) => ({
            index: image.index,
            reference: image.reference,
            size: image.size,
            digest: image.digest,
            url: new URL(
              `/api/mcp/imports/${id}/images/${image.index}`,
              mcpResourceUrl()
            ).toString(),
          })),
          next_step: manifest.images.length > 0
            ? "Use HTTP PUT to upload each referenced local image as raw bytes with the returned upload token header, then call finalize_markdown_draft_import."
            : "Call finalize_markdown_draft_import now.",
        },
        audit: { bundleId: id, status: "uploading", imageCount: manifest.images.length },
      }
    },
  })
}

async function loadActiveBundle(id: string, uploadToken: string) {
  const bundle = await prisma.mcpImportBundle.findUnique({ where: { id } })
  if (!bundle) throw new NotFoundError("MCP 导入会话不存在")
  if (!uploadTokenMatches(uploadToken, bundle.uploadTokenHash)) {
    throw new PermissionError("MCP 导入 upload token 无效")
  }
  if (bundle.expiresAt.getTime() <= Date.now()) {
    await cleanupStagedImportBundle(id)
    throw new ValidationError("MCP 导入会话已过期")
  }
  if (bundle.cleanedAt) throw new ConflictError("MCP 导入会话已经结束")
  return { ...bundle, manifest: storedManifestSchema.parse(bundle.manifest) }
}

export async function storeRemoteImportImage(input: {
  bundleId: string
  uploadToken: string
  index: number
  declaredSize: number
  readBuffer: () => Promise<Buffer>
}) {
  const bundle = await loadActiveBundle(input.bundleId, input.uploadToken)
  if (bundle.approvalId) throw new ConflictError("MCP 导入会话已经提交审批")
  const expected = bundle.manifest.images.find((image) => image.index === input.index)
  if (!expected) throw new NotFoundError("MCP 导入图片不在清单中")
  if (input.declaredSize !== expected.size) throw new ValidationError("MCP 导入图片大小不匹配")
  const buffer = await input.readBuffer()
  if (buffer.length !== expected.size) throw new ValidationError("MCP 导入图片大小不匹配")
  if (sha256(buffer) !== expected.digest) throw new ValidationError("MCP 导入图片摘要不匹配")
  if (!detectImageExtension(buffer)) throw new ValidationError("MCP 导入图片格式无效")

  const target = imagePath(bundle.id, expected.index)
  try {
    await writeFile(target, buffer, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const existing = await readFile(target)
    if (sha256(existing) !== expected.digest) throw new ConflictError("MCP 导入图片已存在但内容不同")
  }
  return { ok: true, index: expected.index }
}

async function verifyBundleFiles(bundle: Awaited<ReturnType<typeof loadActiveBundle>>) {
  const source = await readFile(sourcePath(bundle.id))
  if (sha256(source) !== bundle.sourceDigest) throw new ValidationError("暂存 Markdown 摘要不匹配")
  for (const image of bundle.manifest.images) {
    const file = imagePath(bundle.id, image.index)
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) throw new ValidationError(`本地图片尚未上传：${image.reference}`)
    if (info.size !== image.size) throw new ValidationError(`暂存图片大小不匹配：${image.reference}`)
    const buffer = await readFile(file)
    if (sha256(buffer) !== image.digest || !detectImageExtension(buffer)) {
      throw new ValidationError(`暂存图片校验失败：${image.reference}`)
    }
  }
}

export async function submitRemoteImportBundle(input: {
  context: McpAuthenticatedContext
  uploadToken: string
  bundleId: string
  config: McpSecurityConfig
}) {
  return runAuthorizedMcpOperation({
    context: input.context,
    config: input.config,
    toolName: "finalize_markdown_draft_import",
    scope: "draft:import",
    write: true,
    parameterSummary: { bundleId: input.bundleId },
    operation: async (credentialId) => {
      const bundle = await loadActiveBundle(input.bundleId, input.uploadToken)
      if (bundle.credentialId !== credentialId) throw new PermissionError("MCP 导入会话不属于当前 credential")
      await verifyBundleFiles(bundle)
      if (bundle.approvalId) {
        const approval = await prisma.mcpApproval.findUniqueOrThrow({ where: { id: bundle.approvalId } })
        return {
          response: {
            status: "pending_approval",
            approval_id: approval.id,
            expires_at: approval.expiresAt.toISOString(),
            draft: bundle.manifest.summary,
          },
          audit: { approvalId: approval.id, bundleId: bundle.id, reused: true },
        }
      }

      const approval = await prisma.$transaction(async (transaction) => {
        const created = await createMcpApproval({
          credentialId,
          toolName: "finalize_markdown_draft_import",
          requiredScope: "draft:import",
          payload: { kind: "create_draft_from_staged_markdown", bundleId: bundle.id },
          parameterSummary: bundle.manifest.summary,
          ttlHours: input.config.approvalTtlHours,
          database: transaction,
        })
        const claimed = await transaction.mcpImportBundle.updateMany({
          where: { id: bundle.id, approvalId: null },
          data: { approvalId: created.id, expiresAt: created.expiresAt },
        })
        if (claimed.count !== 1) throw new ConflictError("MCP 导入会话已经提交审批")
        return created
      })
      return {
        response: {
          status: "pending_approval",
          approval_id: approval.id,
          expires_at: approval.expiresAt.toISOString(),
          draft: bundle.manifest.summary,
        },
        audit: { approvalId: approval.id, bundleId: bundle.id, status: "pending_approval" },
      }
    },
  })
}

export async function materializeStagedMarkdownImport(bundleId: string) {
  if (!BUNDLE_ID_PATTERN.test(bundleId)) throw new ValidationError("MCP 导入会话 ID 无效")
  const bundle = await prisma.mcpImportBundle.findUnique({ where: { id: bundleId } })
  if (!bundle) throw new NotFoundError("MCP 导入会话不存在")
  if (bundle.cleanedAt) throw new ConflictError("MCP 导入暂存文件已清理")
  const manifest = storedManifestSchema.parse(bundle.manifest)
  const sourceBuffer = await readFile(sourcePath(bundle.id))
  if (sha256(sourceBuffer) !== bundle.sourceDigest) throw new ValidationError("暂存 Markdown 摘要不匹配")
  const draft = parseMarkdownDraft(bundle.sourceFile, sourceBuffer.toString("utf8"))
  const references = markdownLocalImageReferences(draft)
  if (JSON.stringify(references) !== JSON.stringify(manifest.images.map((image) => image.reference))) {
    throw new ValidationError("暂存 Markdown 图片清单不匹配")
  }

  const replacements = new Map<string, string>()
  const createdUrls: string[] = []
  const cleanup = async () => {
    await Promise.allSettled(createdUrls.map(async (url) => {
      const file = uploadFilePath(url)
      if (file) await rm(file, { force: true })
    }))
  }
  try {
    for (const image of manifest.images) {
      const buffer = await readFile(imagePath(bundle.id, image.index))
      if (buffer.length !== image.size || sha256(buffer) !== image.digest) {
        throw new ValidationError(`暂存图片发生变化：${image.reference}`)
      }
      const url = await storeImageBuffer(buffer)
      createdUrls.push(url)
      replacements.set(image.reference, url)
    }
    const categoryId = await resolveBlogCategory(draft.categoryReference)
    const input = validatePostCreate({
      title: draft.title,
      content: rewriteMarkdownImageReferences(draft.content, replacements),
      excerpt: draft.excerpt,
      categoryId,
      tags: draft.tags,
      coverImage: draft.coverReference
        ? replacements.get(draft.coverReference) ?? draft.coverReference
        : null,
      draftMetadata: draft.draftMetadata,
      status: "DRAFT",
      publishedAt: null,
    })
    return { input, importedImages: createdUrls, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export async function cleanupStagedImportBundle(id: string, consumed = false) {
  if (!BUNDLE_ID_PATTERN.test(id)) return
  await removeBundleFiles(id)
  await prisma.mcpImportBundle.updateMany({
    where: { id, cleanedAt: null },
    data: {
      cleanedAt: new Date(),
      ...(consumed ? { consumedAt: new Date() } : {}),
    },
  })
}

export async function cleanupExpiredImportBundles(limit = 20) {
  const bundles = await prisma.mcpImportBundle.findMany({
    where: { expiresAt: { lt: new Date() }, cleanedAt: null },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  })
  await Promise.allSettled(bundles.map((bundle) => cleanupStagedImportBundle(bundle.id)))
  return bundles.length
}
