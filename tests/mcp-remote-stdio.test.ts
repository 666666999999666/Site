import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

interface RecordedRequest {
  method: string
  url: string
  authorization: string | undefined
  uploadToken: string | undefined
  contentLength: string | undefined
  body: Buffer
}

function textResult(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content
  assert.ok(Array.isArray(content) && content[0]?.type === "text")
  return JSON.parse(content[0].text) as Record<string, unknown>
}

test("remote stdio mode transports local Markdown to the HTTPS gateway without a database", {
  timeout: 20_000,
}, async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "qz-mcp-remote-"))
  const assets = path.join(sandbox, "assets")
  await mkdir(assets)
  await writeFile(path.join(assets, "cover.png"), onePixelPng)
  await writeFile(path.join(sandbox, "remote-draft.md"), [
    "---",
    "title: 线上 MCP 传输测试",
    "cover: ./assets/cover.png",
    "---",
    "",
    "用户已有正文",
    "",
    "![封面](./assets/cover.png)",
  ].join("\n"))
  const emptyEnv = path.join(sandbox, "empty.env")
  await writeFile(emptyEnv, "")

  const requests: RecordedRequest[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const recorded: RecordedRequest = {
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
      uploadToken: request.headers["x-mcp-upload-token"] as string | undefined,
      contentLength: request.headers["content-length"],
      body: Buffer.concat(chunks),
    }
    requests.push(recorded)

    response.setHeader("Content-Type", "application/json")
    if (recorded.method === "GET" && recorded.url === "/api/mcp/gateway") {
      response.end(JSON.stringify({ ok: true }))
      return
    }
    if (recorded.method === "POST" && recorded.url === "/api/mcp/gateway/imports") {
      response.statusCode = 201
      response.end(JSON.stringify({
        bundle_id: "a12e7204-7f36-4bf7-8ce2-81dc1f6b0860",
        upload_token: "upload-secret",
        image_count: 1,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }))
      return
    }
    if (recorded.method === "PUT" && recorded.url.endsWith("/images/0")) {
      response.end(JSON.stringify({ ok: true, index: 0 }))
      return
    }
    if (recorded.method === "POST" && recorded.url.endsWith("/submit")) {
      response.end(JSON.stringify({ status: "pending_approval", approval_id: "approval-1" }))
      return
    }
    if (recorded.method === "POST" && recorded.url === "/api/mcp/gateway/tools/search_drafts") {
      response.end(JSON.stringify({ count: 1, results: [{ id: "draft-1", title: "线上草稿" }] }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: "not found" }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")

  const projectRoot = path.resolve(import.meta.dirname, "..")
  const childEnv = Object.fromEntries(
    Object.entries({
      ...process.env,
      DATABASE_URL: "",
      DOTENV_CONFIG_PATH: emptyEnv,
      BLOG_MCP_CREDENTIAL: "remote-test-credential",
      MCP_REMOTE_URL: `http://127.0.0.1:${address.port}`,
      MCP_MARKDOWN_ROOT: sandbox,
      MCP_IMAGE_ROOT: sandbox,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  )
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(projectRoot, "mcp", "server.ts"),
    ],
    env: childEnv,
    stderr: "pipe",
  })
  const client = new Client({ name: "qz-mcp-remote-test", version: "1.0.0" })

  try {
    await client.connect(transport)

    const imported = textResult(await client.callTool({
      name: "create_draft_from_markdown",
      arguments: { local_path: "remote-draft.md" },
    }))
    assert.equal(imported.status, "pending_approval")
    assert.equal(imported.approval_id, "approval-1")

    const searched = textResult(await client.callTool({
      name: "search_drafts",
      arguments: { title: "线上", status: "DRAFT", limit: 5 },
    }))
    assert.equal(searched.count, 1)

    assert.ok(requests.length >= 5)
    assert.ok(requests.every((request) => request.authorization === "Bearer remote-test-credential"))

    const init = requests.find((request) => request.url === "/api/mcp/gateway/imports")
    assert.ok(init)
    const initBody = JSON.parse(init.body.toString("utf8")) as {
      markdown: string
      source_file: string
      images: Array<{ reference: string; size: number }>
    }
    assert.equal(initBody.source_file, "remote-draft.md")
    assert.match(initBody.markdown, /用户已有正文/)
    assert.deepEqual(initBody.images.map((image) => image.reference), ["./assets/cover.png"])

    const image = requests.find((request) => request.url.endsWith("/images/0"))
    assert.ok(image)
    assert.equal(image.uploadToken, "upload-secret")
    assert.equal(image.contentLength, String(onePixelPng.length))
    assert.deepEqual(image.body, onePixelPng)

    const search = requests.find((request) => request.url.endsWith("/tools/search_drafts"))
    assert.ok(search)
    assert.deepEqual(JSON.parse(search.body.toString("utf8")), {
      title: "线上",
      status: "DRAFT",
      limit: 5,
    })
  } finally {
    await client.close().catch(() => undefined)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(sandbox, { recursive: true, force: true })
  }
})
