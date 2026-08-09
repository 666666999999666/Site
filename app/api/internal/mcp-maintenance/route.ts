import { NextRequest, NextResponse } from "next/server"
import { isDirectLoopbackRequest } from "@/lib/mcp/internal-request"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
