import { NextResponse } from "next/server"

export function POST() {
  return NextResponse.json(
    {
      error: "本地固定凭证导入已停用，请连接 /api/mcp 并使用 OAuth 远程导入工具",
      code: "REMOTE_MCP_OAUTH_REQUIRED",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  )
}
