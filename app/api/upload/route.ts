import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { writeFile, mkdir, unlink } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject } from "@/lib/validation"
import {
  detectImageExtension,
  MAX_UPLOAD_BYTES,
  uploadFilePath,
} from "@/lib/uploads"

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()

    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      throw new ValidationError("无文件")
    }

    if (file.size <= 0) throw new ValidationError("图片为空")
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("图片过大（限 5MB）")
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = detectImageExtension(buf)
    if (!ext) throw new ValidationError("文件内容不是有效的 JPG/PNG/GIF/WebP 图片")

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    const uploadDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, filename), buf)

    return NextResponse.json({ url: `/uploads/${filename}` })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const body = await readJsonObject(req)
    if (typeof body.url !== "string") throw new ValidationError("图片路径必填")
    const filePath = uploadFilePath(body.url)
    if (!filePath) throw new ValidationError("图片路径无效")

    try {
      await unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundError("图片不存在")
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
