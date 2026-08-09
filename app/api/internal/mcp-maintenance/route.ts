import { NextRequest, NextResponse } from "next/server"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isDirectLoopbackRequest(request: NextRequest): boolean {
  const host = request.headers.get("host")?.toLowerCase()
  return (host === "127.0.0.1:3000" || host === "localhost:3000")
    && !request.headers.has("x-forwarded-for")
    && !request.headers.has("x-forwarded-host")
}

export async function POST(request: NextRequest) {
  if (!isDirectLoopbackRequest(request)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    return NextResponse.json(await runMcpMaintenance({ force: true }), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("[MCP maintenance failure]", error)
    return NextResponse.json({ error: "maintenance_failed" }, { status: 500 })
  }
}
