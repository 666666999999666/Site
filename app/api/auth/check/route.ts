import { NextResponse } from "next/server"
import { auth } from "@/lib/auth/better-auth"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  return NextResponse.json(
    { isLoggedIn: Boolean(session?.user?.id) },
    { headers: { "Cache-Control": "no-store" } }
  )
}
