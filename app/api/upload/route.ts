import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "无文件" }, { status: 400 })

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片" }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "图片过大（限 5MB）" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() || "png"
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const uploadDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadDir, { recursive: true })
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(uploadDir, filename), buf)

  return NextResponse.json({ url: `/uploads/${filename}` })
}
