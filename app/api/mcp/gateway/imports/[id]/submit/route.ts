import { NextResponse } from "next/server"

export function POST() {
  return NextResponse.json(
    {
      error: "本地固定凭证导入已停用，请通过 /api/mcp 调用 finalize_markdown_draft_import",
      code: "REMOTE_MCP_OAUTH_REQUIRED",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  )
}
