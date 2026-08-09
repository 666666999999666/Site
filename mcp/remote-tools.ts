import { readFile, stat } from "fs/promises"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { AppError } from "../lib/errors"
import { prepareMarkdownImport } from "../lib/markdown-import"
import type { McpRuntimeConfig } from "../lib/mcp/config"
import type { McpToolInputMap } from "../lib/mcp/tool-schemas"
import { createRegisteredMarkdownImportMcpServer } from "./register-tools"

const importSessionSchema = z.object({
  bundle_id: z.string().uuid(),
  upload_token: z.string().min(1),
  image_count: z.number().int().min(0),
  expires_at: z.string(),
}).strict()

function toolResult(value: Record<string, unknown>, isError = false): CallToolResult {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  }
}

async function gatewayRequest(
  config: McpRuntimeConfig,
  pathname: string,
  init: RequestInit = {},
  uploadToken?: string
): Promise<Record<string, unknown>> {
  if (!config.remoteUrl) throw new Error("MCP_REMOTE_URL 未配置")
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${config.credential}`)
  headers.set("Accept", "application/json")
  if (uploadToken) headers.set("X-MCP-Upload-Token", uploadToken)
  const response = await fetch(`${config.remoteUrl}${pathname}`, {
    ...init,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(90_000),
  })
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `线上 MCP 请求失败（${response.status}）`
    const code = typeof payload?.code === "string" ? payload.code : "REMOTE_MCP_ERROR"
    throw new AppError(message, code, response.status)
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("线上 MCP 返回了无效响应", "REMOTE_MCP_RESPONSE", 502)
  }
  return payload
}

async function createRemoteDraft(config: McpRuntimeConfig, localPath: string) {
  const prepared = await prepareMarkdownImport(localPath, config)
  const source = await readFile(prepared.payload.sourcePath)
  const images = await Promise.all(prepared.payload.images.map(async (image) => ({
    reference: image.reference,
    digest: image.digest,
    size: (await stat(image.path)).size,
    path: image.path,
  })))
  const session = importSessionSchema.parse(await gatewayRequest(config, "/api/mcp/gateway/imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_file: prepared.summary.sourceFile,
      source_digest: prepared.payload.sourceDigest,
      markdown: source.toString("utf8"),
      images: images.map(({ reference, digest, size }) => ({ reference, digest, size })),
    }),
  }))
  if (session.image_count !== images.length) {
    throw new AppError("线上 MCP 图片清单数量不一致", "REMOTE_MCP_RESPONSE", 502)
  }
  for (let index = 0; index < images.length; index++) {
    await gatewayRequest(config, `/api/mcp/gateway/imports/${session.bundle_id}/images/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: await readFile(images[index].path),
    }, session.upload_token)
  }
  return gatewayRequest(
    config,
    `/api/mcp/gateway/imports/${session.bundle_id}/submit`,
    { method: "POST" },
    session.upload_token
  )
}

export async function verifyRemoteGateway(config: McpRuntimeConfig) {
  await gatewayRequest(config, "/api/mcp/gateway")
}

export function createMarkdownImportMcpServer(config: McpRuntimeConfig) {
  return createRegisteredMarkdownImportMcpServer(async (
    _name,
    input: McpToolInputMap["create_draft_from_markdown"]
  ) => {
    try {
      return toolResult(await createRemoteDraft(config, input.local_path))
    } catch (error) {
      if (!(error instanceof AppError)) console.error("[Remote MCP tool error]", error)
      return toolResult({
        error: error instanceof AppError ? error.message : "线上 MCP tool 执行失败",
        code: error instanceof AppError ? error.code : "REMOTE_MCP_ERROR",
      }, true)
    }
  })
}
