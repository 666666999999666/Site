import { createHash, randomUUID } from "crypto"
import { mkdir, readFile, unlink, writeFile } from "fs/promises"
import path from "path"
import { ValidationError } from "@/lib/errors"
import { detectImageExtension, MAX_UPLOAD_BYTES } from "@/lib/uploads"

const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|gif|webp)$/

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const

const FILE_EXTENSIONS: Record<keyof typeof MIME_BY_EXTENSION, readonly string[]> = {
  jpg: [".jpg", ".jpeg"],
  png: [".png"],
  gif: [".gif"],
  webp: [".webp"],
}

export function questionImageDirectory(): string {
  return process.env.STUDY_UPLOAD_DIR
    ? path.resolve(process.env.STUDY_UPLOAD_DIR)
    : path.join(process.cwd(), "data", "study-uploads")
}

export function questionImagePath(storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new ValidationError("图片存储键无效")
  }
  return path.join(questionImageDirectory(), storageKey)
}

export interface StoredQuestionImage {
  storageKey: string
  mimeType: string
  byteSize: number
  sha256: string
}

export async function storeQuestionImage(file: File): Promise<StoredQuestionImage> {
  if (file.size <= 0) throw new ValidationError("图片为空")
  if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("图片过大（限 5MB）")

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length !== file.size) throw new ValidationError("图片读取不完整")
  const extension = detectImageExtension(buffer)
  if (!extension) throw new ValidationError("文件内容不是有效的 JPG/PNG/GIF/WebP 图片")

  const expectedMime = MIME_BY_EXTENSION[extension]
  if (file.type.toLowerCase() !== expectedMime) {
    throw new ValidationError("图片 MIME 与文件内容不一致")
  }
  const declaredExtension = path.extname(file.name).toLowerCase()
  if (!FILE_EXTENSIONS[extension].includes(declaredExtension)) {
    throw new ValidationError("图片扩展名与文件内容不一致")
  }

  const storageKey = `${randomUUID()}.${extension}`
  await mkdir(questionImageDirectory(), { recursive: true })
  await writeFile(questionImagePath(storageKey), buffer, { flag: "wx", mode: 0o640 })

  return {
    storageKey,
    mimeType: expectedMime,
    byteSize: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  }
}

export async function removeQuestionImageFile(storageKey: string): Promise<void> {
  try {
    await unlink(questionImagePath(storageKey))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

export function readQuestionImage(storageKey: string): Promise<Buffer> {
  return readFile(questionImagePath(storageKey))
}
