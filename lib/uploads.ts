import path from "path"
import { mkdir, rm, unlink, writeFile } from "fs/promises"
import { randomUUID } from "crypto"
import { ValidationError } from "./errors"
import { detectImageExtension } from "./image-signature"
import { prepareImageVariants, type ImageVariantResult } from "./image-variants"
import { imageDerivativeNames } from "./responsive-image"

export { detectImageExtension } from "./image-signature"

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export function uploadDirectory(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "public", "uploads")
}

export function uploadFilePath(url: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url)
  if (!match) return null
  return path.join(uploadDirectory(), match[1])
}

export interface StoredImageResult {
  url: string
  processing: ImageVariantResult
}

export async function storeImageBufferWithResult(buffer: Buffer): Promise<StoredImageResult> {
  if (buffer.length <= 0) throw new ValidationError("图片为空")
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError("图片过大（限 5MB）")
  }
  const extension = detectImageExtension(buffer)
  if (!extension) {
    throw new ValidationError("文件内容不是有效的 JPG/PNG/GIF/WebP 图片")
  }

  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`
  const uploadDir = uploadDirectory()
  await mkdir(uploadDir, { recursive: true })
  const file = path.join(uploadDir, filename)
  await writeFile(file, buffer, { flag: "wx" })
  const processing = await prepareImageVariants(file)
  return { url: `/uploads/${filename}`, processing }
}

/** Compatibility for callers that need only the durable original URL. */
export async function storeImageBuffer(buffer: Buffer): Promise<string> {
  return (await storeImageBufferWithResult(buffer)).url
}

/** Delete only this public original's finite family; caller owns reference checks. */
export async function removeUploadFiles(url: string): Promise<boolean> {
  const file = uploadFilePath(url)
  if (!file) throw new ValidationError("图片路径无效")
  let existed = true
  try { await unlink(file) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    existed = false
  }
  for (const derivative of imageDerivativeNames(path.basename(file))) {
    await rm(path.join(path.dirname(file), derivative), { force: true })
  }
  return existed
}
