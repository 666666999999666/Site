import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api/handler"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { unlink } from "fs/promises"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject } from "@/lib/validation"
import {
  MAX_UPLOAD_BYTES,
  storeImageBuffer,
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
    const url = await storeImageBuffer(buf)
    return NextResponse.json({ url })
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
