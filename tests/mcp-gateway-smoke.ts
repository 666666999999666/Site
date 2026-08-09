import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prisma } from "../lib/db"
import { approveMcpApproval, deleteMcpApproval } from "../lib/mcp/approval-service"
import { deleteMcpAuditLog } from "../lib/mcp/audit-service"
import { loadMcpSecurityConfig } from "../lib/mcp/config"
import {
  createMcpCredential,
  deleteMcpCredential,
  revokeMcpCredential,
} from "../lib/mcp/credential-service"
import {
  createRemoteImportBundle,
  storeRemoteImportImage,
  submitRemoteImportBundle,
} from "../lib/mcp/import-staging-service"
import { runGatewayMcpTool } from "../lib/mcp/tool-service"
import { authenticateStaticMcpContext } from "../lib/mcp/auth-context"

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

  const created = await createMcpCredential(`gateway-smoke-${marker}`)
  const config = loadMcpSecurityConfig()
  const context = await authenticateStaticMcpContext(created.token)

  try {
    const session = await createRemoteImportBundle({
      context,
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
      context,
      uploadToken: session.upload_token as string,
      bundleId: session.bundle_id as string,
      config,
    })
    assert.equal(submitted.status, "pending_approval")
    assert.equal(await prisma.post.count({ where: { title } }), 0)

    const approvalId = submitted.approval_id as string
    const pending = await runGatewayMcpTool(context, config, "get_approval_status", {
      approval_id: approvalId,
    })
    assert.equal(pending.status, "pending_approval")
    assert.equal(pending.post_id, null)
    await approveMcpApproval(approvalId)
    const post = await prisma.post.findFirstOrThrow({ where: { title } })
    assert.equal(post.status, "DRAFT")
    assert.match(post.content, new RegExp(bodyMarker))
    assert.match(post.content, /!\[封面\]\(\/uploads\//)
    assert.match(post.coverImage ?? "", /^\/uploads\//)
    const approved = await runGatewayMcpTool(context, config, "get_approval_status", {
      approval_id: approvalId,
    })
    assert.equal(approved.status, "approved")
    assert.equal(approved.post_id, post.id)

    const bundle = await prisma.mcpImportBundle.findUniqueOrThrow({
      where: { id: session.bundle_id as string },
    })
    assert.ok(bundle.cleanedAt)
    assert.ok(bundle.consumedAt)

    const audit = await prisma.mcpAuditLog.findMany({
      where: { credentialId: created.credential.id },
    })
    assert.ok(audit.length >= 3)
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(bodyMarker)))
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(created.token)))

    await assert.rejects(deleteMcpCredential(created.credential.id), /先撤销/)
    await deleteMcpAuditLog(audit[0].id)
    await deleteMcpApproval(approvalId)
    await revokeMcpCredential(created.credential.id)
    await deleteMcpCredential(created.credential.id)
    assert.equal(await prisma.mcpCredential.count({ where: { id: created.credential.id } }), 0)

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
