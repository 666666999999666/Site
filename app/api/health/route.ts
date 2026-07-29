import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[HealthcheckFailed]", error)
    return NextResponse.json({ status: "unavailable" }, { status: 503 })
  }
}
