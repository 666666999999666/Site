import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/
const NO_STORE_HEADERS = { "Cache-Control": "no-store" }

export async function GET() {
  const releaseSha = process.env.APP_RELEASE_SHA
  if (!releaseSha || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      { status: "ok", releaseSha },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error("[HealthcheckFailed]", error)
    return NextResponse.json(
      { status: "unavailable", releaseSha },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }
}
