import { NextRequest, NextResponse } from "next/server"
import { createPost, searchPosts } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePostCreate } from "@/lib/validation"
import { ValidationError } from "@/lib/errors"

export async function GET(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    if (q && q.length > 200) {
      throw new ValidationError("搜索关键词过长")
    }
    const posts = await searchPosts({ keyword: q, status: "ALL" })
    return NextResponse.json(posts)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validatePostCreate(await readJsonObject(req))
    const post = await createPost(input)
    return NextResponse.json(post, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
