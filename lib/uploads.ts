import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { randomUUID } from "crypto"
import { ValidationError } from "./errors"
import { detectImageExtension } from "./image-signature"

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

export async function storeImageBuffer(buffer: Buffer): Promise<string> {
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
  await writeFile(path.join(uploadDir, filename), buffer, { flag: "wx" })
  return `/uploads/${filename}`
}
