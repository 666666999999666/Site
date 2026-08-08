import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { prisma } from "../lib/db"
import { approveMcpApproval } from "../lib/mcp/approval-service"
import { mcpCredentialId, revokeMcpCredential } from "../lib/mcp/credential-service"

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

function textResult(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content
  assert.ok(Array.isArray(content) && content[0]?.type === "text")
  return JSON.parse(content[0].text) as Record<string, unknown>
}

async function pendingApproval(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  assert.notEqual(result.isError, true)
  const value = textResult(result)
  assert.equal(value.status, "pending_approval")
  assert.equal(typeof value.approval_id, "string")
  return value.approval_id as string
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required")
  assert.ok(process.env.BLOG_MCP_CREDENTIAL, "BLOG_MCP_CREDENTIAL is required")

  const sandbox = await mkdtemp(path.join(os.tmpdir(), "qz-mcp-stdio-"))
  const assets = path.join(sandbox, "assets")
  const uploads = path.join(sandbox, "uploads")
  await Promise.all([mkdir(assets), mkdir(uploads)])
  await writeFile(path.join(assets, "cover.png"), onePixelPng)
  process.env.MCP_MARKDOWN_ROOT = sandbox
  process.env.MCP_IMAGE_ROOT = sandbox
  process.env.UPLOAD_DIR = uploads
  process.env.MCP_SEARCH_RATE_LIMIT_PER_MINUTE = "2"

  const projectRoot = path.resolve(import.meta.dirname, "..")
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(projectRoot, "mcp", "server.ts"),
    ],
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    stderr: "pipe",
  })
  const client = new Client({ name: "qz-mcp-smoke", version: "1.0.0" })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "create_category",
        "create_draft_from_markdown",
        "search_drafts",
        "todo_to_draft",
        "update_draft_metadata",
      ]
    )

    const firstSearch = textResult(await client.callTool({
      name: "search_drafts",
      arguments: { status: "DRAFT", limit: 1 },
    }))
    assert.equal(firstSearch.count, 0)

    const categoryName = `MCP smoke ${randomUUID()}`
    const categoryApproval = await pendingApproval(client, "create_category", {
      name: categoryName,
      type: "BLOG",
      sort_order: 0,
    })
    assert.equal(await prisma.category.count({ where: { name: categoryName } }), 0)
    await approveMcpApproval(categoryApproval)
    const category = await prisma.category.findFirstOrThrow({ where: { name: categoryName } })
    assert.ok(await prisma.mcpExecution.findUnique({ where: { approvalId: categoryApproval } }))
    await prisma.mcpApproval.update({
      where: { id: categoryApproval },
      data: { status: "PENDING_APPROVAL", processingAt: null, reviewedAt: null, executedAt: null },
    })
    await approveMcpApproval(categoryApproval)
    assert.equal(await prisma.category.count({ where: { name: categoryName } }), 1)

    await writeFile(path.join(sandbox, "draft.md"), [
      "---",
      "title: MCP 导入草稿",
      "description: 用户写的摘要",
      `category: ${categoryName}`,
      "tags: [MCP, Markdown]",
      "cover: ./assets/cover.png",
      "custom:",
      "  reviewed: false",
      "---",
      "",
      "用户写的正文 $x^2$",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      "![封面](./assets/cover.png)",
    ].join("\n"))
    const importApproval = await pendingApproval(client, "create_draft_from_markdown", {
      local_path: "draft.md",
    })
    assert.equal(await prisma.post.count(), 0)
    await approveMcpApproval(importApproval)
    const imported = await prisma.post.findFirstOrThrow({ where: { title: "MCP 导入草稿" } })
    assert.equal(imported.status, "DRAFT")
    assert.equal(imported.categoryId, category.id)
    assert.deepEqual(imported.tags, ["MCP", "Markdown"])
    assert.match(imported.content, /用户写的正文 \$x\^2\$/)
    assert.match(imported.content, /```mermaid\ngraph TD\n  A --> B\n```/)
    assert.match(imported.content, /!\[封面\]\(\/uploads\//)
    assert.match(imported.coverImage ?? "", /^\/uploads\//)
    assert.deepEqual(imported.draftMetadata, {
      title: "MCP 导入草稿",
      description: "用户写的摘要",
      category: categoryName,
      tags: ["MCP", "Markdown"],
      cover: "./assets/cover.png",
      custom: { reviewed: false },
    })

    const originalContent = imported.content
    const metadataApproval = await pendingApproval(client, "update_draft_metadata", {
      post_id: imported.id,
      title: "MCP metadata 已更新",
      description: "更新后的摘要",
      tags: ["MCP", "已审批"],
      category: null,
      cover: null,
      draft_metadata: { reviewed: true },
    })
    assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: imported.id } })).title, "MCP 导入草稿")
    await approveMcpApproval(metadataApproval)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: imported.id } })
    assert.equal(updated.title, "MCP metadata 已更新")
    assert.equal(updated.content, originalContent)
    assert.equal(updated.categoryId, null)
    assert.equal(updated.coverImage, null)
    assert.deepEqual(updated.draftMetadata, { reviewed: true })

    const todo = await prisma.todo.create({
      data: { title: "用户 Todo", description: "用户已有的 Todo 描述" },
    })
    const todoApproval = await pendingApproval(client, "todo_to_draft", {
      todo_id: todo.id,
      mark_done: true,
    })
    assert.equal(await prisma.post.count({ where: { title: todo.title } }), 0)
    await approveMcpApproval(todoApproval)
    const todoDraft = await prisma.post.findFirstOrThrow({ where: { title: todo.title } })
    assert.equal(todoDraft.content, "用户已有的 Todo 描述")
    assert.equal((await prisma.todo.findUniqueOrThrow({ where: { id: todo.id } })).status, "DONE")

    const secondSearch = textResult(await client.callTool({
      name: "search_drafts",
      arguments: { title: "MCP metadata", status: "DRAFT", limit: 10 },
    }))
    assert.equal(secondSearch.count, 1)
    const rateLimited = await client.callTool({
      name: "search_drafts",
      arguments: { status: "ALL", limit: 1 },
    })
    assert.equal(rateLimited.isError, true)
    assert.equal(textResult(rateLimited).code, "RATE_LIMITED")

    const credentialId = mcpCredentialId(process.env.BLOG_MCP_CREDENTIAL)
    const storedCredential = await prisma.mcpCredential.findUniqueOrThrow({ where: { id: credentialId } })
    assert.match(storedCredential.secretHash, /^scrypt\$/)
    assert.ok(!storedCredential.secretHash.includes(process.env.BLOG_MCP_CREDENTIAL))
    await prisma.mcpCredential.update({
      where: { id: credentialId },
      data: { scopes: ["draft:read"] },
    })
    const missingScope = await client.callTool({
      name: "create_category",
      arguments: { name: "must-lack-scope", type: "BLOG" },
    })
    assert.equal(missingScope.isError, true)
    assert.equal(textResult(missingScope).code, "PERMISSION_DENIED")
    assert.equal(await prisma.category.count({ where: { name: "must-lack-scope" } }), 0)
    await revokeMcpCredential(credentialId)
    const revoked = await client.callTool({
      name: "create_category",
      arguments: { name: "must-not-run", type: "BLOG" },
    })
    assert.equal(revoked.isError, true)
    assert.equal(textResult(revoked).code, "AUTH_ERROR")
    assert.equal(await prisma.category.count({ where: { name: "must-not-run" } }), 0)

    const audits = await prisma.mcpAuditLog.findMany({ where: { credentialId } })
    assert.ok(audits.length >= 12)
    assert.ok(audits.every((audit) => !JSON.stringify(audit).includes("用户写的正文")))
    assert.ok(audits.every((audit) => !JSON.stringify(audit).includes(process.env.BLOG_MCP_CREDENTIAL!)))

    process.stdout.write("MCP stdio smoke test passed\n")
  } finally {
    await client.close().catch(() => undefined)
    await prisma.$disconnect()
    await rm(sandbox, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
