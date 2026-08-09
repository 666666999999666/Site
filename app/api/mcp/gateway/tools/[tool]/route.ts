import { NextResponse } from "next/server"

export function POST() {
  return NextResponse.json(
    {
      error: "远程 Tool Gateway 已停用，请连接 https://liaoqizai.site/api/mcp 并使用 OAuth",
      code: "REMOTE_MCP_OAUTH_REQUIRED",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  )
}
