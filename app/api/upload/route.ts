import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { handleApiError } from "@/lib/api/handler"
import { ValidationError } from "@/lib/errors"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      throw new ValidationError("无文件")
    }

    const ext = MIME_TO_EXT[file.type]
    if (!ext) {
      throw new ValidationError("仅支持 JPG/PNG/GIF/WebP 格式")
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new ValidationError("图片过大（限 5MB）")
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const uploadDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadDir, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), buf)

    return NextResponse.json({ url: `/uploads/${filename}` })
  } catch (e) {
    return handleApiError(e)
  }
}
