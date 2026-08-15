import { NextRequest, NextResponse } from "next/server"
import { createPost, searchPosts } from "@/lib/posts"
import { handleApiError } from "@/lib/api/handler"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePostCreate } from "@/lib/validation"
import { ValidationError } from "@/lib/errors"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { privateNoStore } from "@/lib/api/private-response"

export async function GET(req: NextRequest) {
  try {
    await ensureAuthenticated()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    if (q && q.length > 200) {
      throw new ValidationError("搜索关键词过长")
    }
    const posts = await searchPosts({ keyword: q, status: "ALL" })
    return privateNoStore(NextResponse.json(posts))
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(req)
    const input = validatePostCreate(await readJsonObject(req))
    const post = await createPost(input)
    return privateNoStore(NextResponse.json(post, { status: 201 }))
  } catch (e) {
    return privateNoStore(handleApiError(e))
  }
}
