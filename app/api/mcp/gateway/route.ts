import { NextResponse } from "next/server"

function gone() {
  return NextResponse.json(
    {
      error: "本地固定凭证 Gateway 已停用，请只配置 https://liaoqizai.site/api/mcp",
      code: "REMOTE_MCP_OAUTH_REQUIRED",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  )
}

export const GET = gone
export const POST = gone
