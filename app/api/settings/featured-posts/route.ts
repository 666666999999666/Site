import { NextRequest, NextResponse } from "next/server"
import { ensureAuthenticated } from "@/lib/api/auth"
import { requireJsonRequest } from "@/lib/api/admin-mutation"
import { handlePrivateApiError, privateNoStore } from "@/lib/api/private-response"
import { readJsonObject } from "@/lib/validation"
import { validateFeaturedPostIds, validateFeaturedPostSearch } from "@/lib/featured-posts"
import { getFeaturedPostsAdminState, saveFeaturedPosts } from "@/lib/featured-posts-store"

export async function GET(request: NextRequest) {
  try {
    await ensureAuthenticated()
    const query = validateFeaturedPostSearch(request.nextUrl.searchParams.get("q"))
    return privateNoStore(NextResponse.json(await getFeaturedPostsAdminState(query)))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureAuthenticated()
    requireJsonRequest(request)
    const ids = validateFeaturedPostIds(await readJsonObject(request))
    await saveFeaturedPosts(ids)
    return privateNoStore(NextResponse.json({ ok: true }))
  } catch (error) {
    return handlePrivateApiError(error)
  }
}
