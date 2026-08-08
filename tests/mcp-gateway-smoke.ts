import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prisma } from "../lib/db"
import { approveMcpApproval } from "../lib/mcp/approval-service"
import { loadMcpSecurityConfig } from "../lib/mcp/config"
import { createMcpCredential, revokeMcpCredential } from "../lib/mcp/credential-service"
import {
  createRemoteImportBundle,
  storeRemoteImportImage,
  submitRemoteImportBundle,
} from "../lib/mcp/import-staging-service"
import { runGatewayMcpTool } from "../lib/mcp/tool-service"

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex")
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required")
  const uploads = await mkdtemp(path.join(os.tmpdir(), "qz-mcp-gateway-"))
  process.env.UPLOAD_DIR = uploads
  const marker = randomUUID()
  const title = `MCP gateway smoke ${marker}`
  const bodyMarker = `owner-body-${marker}`
  const markdown = [
    "---",
    `title: ${title}`,
    "description: 网关导入测试",
    "tags: [MCP, gateway]",
    "cover: ./cover.png",
    "---",
    "",
    bodyMarker,
    "",
    "![封面](./cover.png)",
  ].join("\n")

  const created = await createMcpCredential(`gateway-smoke-${marker}`, [
    "draft:create",
    "draft:read",
    "draft:update",
  ])
  const config = loadMcpSecurityConfig(created.token)

  try {
    const session = await createRemoteImportBundle({
      credentialToken: created.token,
      config,
      value: {
        source_file: "gateway-smoke.md",
        source_digest: sha256(markdown),
        markdown,
        images: [{
          reference: "./cover.png",
          digest: sha256(onePixelPng),
          size: onePixelPng.length,
        }],
      },
    })
    await assert.rejects(
      storeRemoteImportImage({
        bundleId: session.bundle_id as string,
        uploadToken: "wrong-token",
        index: 0,
        buffer: onePixelPng,
      }),
      /upload token 无效/
    )
    await storeRemoteImportImage({
      bundleId: session.bundle_id as string,
      uploadToken: session.upload_token as string,
      index: 0,
      buffer: onePixelPng,
    })
    const submitted = await submitRemoteImportBundle({
      credentialToken: created.token,
      uploadToken: session.upload_token as string,
      bundleId: session.bundle_id as string,
      config,
    })
    assert.equal(submitted.status, "pending_approval")
    assert.equal(await prisma.post.count({ where: { title } }), 0)

    const approvalId = submitted.approval_id as string
    await approveMcpApproval(approvalId)
    const post = await prisma.post.findFirstOrThrow({ where: { title } })
    assert.equal(post.status, "DRAFT")
    assert.match(post.content, new RegExp(bodyMarker))
    assert.match(post.content, /!\[封面\]\(\/uploads\//)
    assert.match(post.coverImage ?? "", /^\/uploads\//)

    const bundle = await prisma.mcpImportBundle.findUniqueOrThrow({
      where: { id: session.bundle_id as string },
    })
    assert.ok(bundle.cleanedAt)
    assert.ok(bundle.consumedAt)

    const searched = await runGatewayMcpTool(config, "search_drafts", {
      title: marker,
      status: "DRAFT",
      limit: 10,
    })
    assert.equal(searched.count, 1)

    const metadata = await runGatewayMcpTool(config, "update_draft_metadata", {
      post_id: post.id,
      description: "审批后的摘要",
      tags: ["MCP", "approved"],
    })
    assert.equal(metadata.status, "pending_approval")
    await approveMcpApproval(metadata.approval_id as string)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    assert.equal(updated.excerpt, "审批后的摘要")
    assert.deepEqual(updated.tags, ["MCP", "approved"])

    const audit = await prisma.mcpAuditLog.findMany({
      where: { credentialId: created.credential.id },
    })
    assert.ok(audit.length >= 6)
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(bodyMarker)))
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(created.token)))

    process.stdout.write("MCP production gateway service smoke test passed\n")
  } finally {
    await revokeMcpCredential(created.credential.id).catch(() => undefined)
    await prisma.$disconnect()
    await rm(uploads, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
