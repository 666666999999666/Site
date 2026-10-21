import { createHash, randomUUID } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { ConflictError, ValidationError } from "./errors"
import { MAX_IMAGE_SOURCE_BYTES, MAX_INPUT_PIXELS, prepareImageVariants, readImageVariantSet } from "./image-variants"
import { RESPONSIVE_IMAGE_WIDTHS, type ImageVariantManifest } from "./responsive-image"

/** Deliberately finite: the admin action is not a general media/path processor. */
export const HISTORICAL_IMAGE_FILENAMES = [
  "1791622386862-b8d44da5.png",
  "1791622386983-20db69a5.png",
  "1791622387126-b8b8caf8.png",
  "1791622387269-003a96dc.png",
  "1791622387381-a1364bfd.png",
  "1791622387474-ae07b957.png",
] as const

export const IMAGE_BACKFILL_PREVIEW_TTL_MS = 10 * 60 * 1000
const MAX_PREVIEWS = 24

export interface BackfillPreviewEntry {
  filename: string
  url: string
  status: "pending" | "skipped" | "failed"
  message: string
  reason?: string
  sourceSha256?: string
  sourceBytes?: number
  width?: number
  height?: number
  plannedFiles: string[]
  existingFiles: string[]
}

export interface BackfillPreview {
  previewToken: string
  expiresAt: string
  entries: BackfillPreviewEntry[]
}

export interface BackfillExecutionEntry {
  filename: string
  url: string
  status: "ready" | "skipped" | "original-only" | "failed"
  message: string
  reason?: string
  manifest?: ImageVariantManifest
}

export interface BackfillExecution {
  entries: BackfillExecutionEntry[]
  ready: number
  skipped: number
  failed: number
  originalOnly: number
}

export interface BackfillExecutionInput {
  previewToken: string
  filenames: string[]
}

export function validateImageBackfillExecution(value: unknown): BackfillExecutionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("请求体必须是 JSON 对象")
  const input = value as Record<string, unknown>
  if (Object.keys(input).some((key) => !["previewToken", "filenames"].includes(key))) throw new ValidationError("不支持的图片补齐字段")
  if (typeof input.previewToken !== "string" || !/^[0-9a-f-]{36}$/i.test(input.previewToken)) throw new ValidationError("请先获取有效预览")
  const filenames = input.filenames
  if (!Array.isArray(filenames) || filenames.length < 1 || filenames.length > HISTORICAL_IMAGE_FILENAMES.length ||
      filenames.some((filename) => typeof filename !== "string" || !HISTORICAL_IMAGE_FILENAMES.some((allowed) => allowed === filename)) ||
      new Set(filenames).size !== filenames.length) {
    throw new ValidationError("仅支持本次清单内 1 至 6 张不同的站内图片")
  }
  return { previewToken: input.previewToken, filenames: [...filenames] as string[] }
}

function samePath(left: string, right: string) {
  return process.platform === "win32" ? path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase() : left === right
}

async function originalSnapshot(directory: string, filename: string) {
  const root = path.resolve(directory)
  if (!samePath(await realpath(root), root)) throw new Error("unsafe-path")
  const file = path.join(root, filename)
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(file), file)) throw new Error("unsafe-path")
  if (info.size <= 0 || info.size > MAX_IMAGE_SOURCE_BYTES) throw new Error("source-size")
  const bytes = await readFile(file)
  if (bytes.length !== info.size || bytes.length > MAX_IMAGE_SOURCE_BYTES) throw new Error("source-changed")
  return { file, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
}

function failure(error: unknown): { reason: string; message: string } {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === "ENOENT") return { reason: "source-missing", message: "原图不存在，未生成任何资源。请确认挂载后重新预览。" }
  if (code === "EACCES" || code === "EPERM") return { reason: "permission-denied", message: "无法读取图片或写入派生资源，请检查上传目录权限后重试。" }
  if (error instanceof Error && error.message === "unsafe-path") return { reason: "unsafe-path", message: "图片或上传目录不是允许的普通路径，已拒绝处理。" }
  if (error instanceof Error && error.message === "source-size") return { reason: "source-size", message: "原图为空或超过 32 MB 处理上限。" }
  if (error instanceof Error && error.message === "source-changed") return { reason: "source-changed", message: "原图与预览不一致，未生成资源；请重新预览。" }
  return { reason: "image-unreadable", message: "无法读取有效图片尺寸，原图保留；请检查文件后重新预览。" }
}

function resultMessage(reason: string | undefined) {
  if (reason === "busy") return "图片处理繁忙，本张未处理；稍后可重试。"
  if (reason === "source-changed") return "原图与预览不一致，未发布资源；请重新预览。"
  if (reason === "source-too-large") return "原图超过 32 MB 处理上限，继续使用原图。"
  if (reason === "animated" || reason === "orientation") return "此图片需保留动画或方向信息，继续使用原图。"
  if (reason === "no-smaller-variant") return "已记录原图尺寸；候选资源没有更小的版本，继续使用原图。"
  return "响应式资源生成失败，原图保留；检查上传目录权限或图片后可重试。"
}

/** Per-process, short-lived review receipts; no secret, database table or queue. */
export function createHistoricalImageBackfill(options: { directory: string | (() => string); now?: () => number }) {
  const now = options.now ?? Date.now
  const previews = new Map<string, { ownerId: string; expires: number; entries: BackfillPreviewEntry[] }>()
  let active = false
  const directory = () => typeof options.directory === "function" ? options.directory() : options.directory

  function claim() {
    if (active) throw new ConflictError("图片清单正在处理中，请等待完成后再试")
    active = true
  }

  function cleanup() {
    for (const [token, preview] of previews) if (preview.expires <= now()) previews.delete(token)
    while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value!)
  }

  return {
    async preview(ownerId: string): Promise<BackfillPreview> {
      claim()
      try {
        const entries: BackfillPreviewEntry[] = []
        for (const filename of HISTORICAL_IMAGE_FILENAMES) {
          const entry: BackfillPreviewEntry = { filename, url: `/uploads/${filename}`, status: "failed", message: "", plannedFiles: [], existingFiles: [] }
          try {
            const source = await originalSnapshot(directory(), filename)
            entry.sourceSha256 = source.sha256
            entry.sourceBytes = source.bytes.length
            const existing = await readImageVariantSet(source.file)
            if (existing && existing.sha256 === source.sha256) {
              Object.assign(entry, { status: "skipped", message: "响应式资源完整且校验通过，将跳过。", width: existing.width, height: existing.height,
                existingFiles: [...existing.variants.map((variant) => path.basename(variant.url)), `${filename}.qz-image.json`] })
            } else {
              const { default: sharp } = await import("sharp")
              const metadata = await sharp(source.bytes, { limitInputPixels: MAX_INPUT_PIXELS, animated: true }).metadata()
              if (!metadata.width || !metadata.height || metadata.width > 100_000 || metadata.height > 100_000 ||
                  metadata.width * metadata.height > MAX_INPUT_PIXELS) throw new Error("image-unreadable")
              entry.width = metadata.width
              entry.height = metadata.height
              if ((metadata.pages ?? 1) > 1 || metadata.orientation && metadata.orientation !== 1) {
                entry.reason = (metadata.pages ?? 1) > 1 ? "animated" : "orientation"
                entry.message = resultMessage(entry.reason)
              } else {
                entry.status = "pending"
                entry.message = "将尝试生成下列候选资源，仅保存比原图更小的 WebP，并最后写入尺寸清单。"
                entry.plannedFiles = [...RESPONSIVE_IMAGE_WIDTHS.filter((width) => width <= metadata.width!).map((width) => `${filename}.qz-${width}.webp`), `${filename}.qz-image.json`]
              }
            }
          } catch (error) { Object.assign(entry, failure(error)) }
          entries.push(entry)
        }
        cleanup()
        const previewToken = randomUUID()
        const expires = now() + IMAGE_BACKFILL_PREVIEW_TTL_MS
        previews.set(previewToken, { ownerId, expires, entries })
        // Return a copy so callers cannot alter the source-bound receipt.
        return { previewToken, expiresAt: new Date(expires).toISOString(), entries: structuredClone(entries) }
      } finally { active = false }
    },

    async execute(ownerId: string, value: unknown): Promise<BackfillExecution> {
      const input = validateImageBackfillExecution(value)
      const preview = previews.get(input.previewToken)
      if (!preview || preview.ownerId !== ownerId || preview.expires <= now()) throw new ConflictError("预览已失效，请重新预览后明确执行")
      claim()
      try {
        const entries: BackfillExecutionEntry[] = []
        for (const filename of input.filenames) {
          const reviewed = preview.entries.find((entry) => entry.filename === filename)!
          const entry: BackfillExecutionEntry = { filename, url: `/uploads/${filename}`, status: "failed", message: "" }
          try {
            if (!reviewed.sourceSha256 || reviewed.status === "failed") {
              entries.push({ ...entry, reason: reviewed.reason, message: reviewed.message || "此图片未通过预览，请重新预览。" })
              continue
            }
            const source = await originalSnapshot(directory(), filename)
            if (source.sha256 !== reviewed.sourceSha256 || source.bytes.length !== reviewed.sourceBytes) throw new Error("source-changed")
            const result = await prepareImageVariants(source.file, directory(), { expectedSourceSha256: reviewed.sourceSha256 })
            entry.status = result.reused ? "skipped" : result.reason === "busy" ? "failed" : result.status
            entry.reason = result.reason
            entry.message = result.reused ? "资源已完整，将跳过。" : result.status === "ready" ? "响应式资源已生成，原图保持不变。" : resultMessage(result.reason)
            if (result.manifest) entry.manifest = result.manifest
          } catch (error) { Object.assign(entry, failure(error)) }
          entries.push(entry)
        }
        return { entries, ready: entries.filter((entry) => entry.status === "ready").length, skipped: entries.filter((entry) => entry.status === "skipped").length,
          failed: entries.filter((entry) => entry.status === "failed").length, originalOnly: entries.filter((entry) => entry.status === "original-only").length }
      } finally { active = false }
    },
  }
}
