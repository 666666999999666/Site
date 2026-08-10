import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"
import { PUT as uploadImportImage } from "../app/api/mcp/imports/[id]/images/[index]/route"
import { prisma } from "../lib/db"
import { approveMcpApproval, deleteMcpApproval } from "../lib/mcp/approval-service"
import { deleteMcpAuditLog } from "../lib/mcp/audit-service"
import { loadMcpSecurityConfig } from "../lib/mcp/config"
import {
  deleteMcpCredential,
  revokeMcpCredential,
} from "../lib/mcp/credential-service"
import {
  createRemoteImportBundle,
  submitRemoteImportBundle,
} from "../lib/mcp/import-staging-service"
import { runGatewayMcpTool } from "../lib/mcp/tool-service"
import type { McpAuthenticatedContext } from "../lib/mcp/auth-context"

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

  const credential = await prisma.mcpCredential.create({
    data: {
      id: randomUUID(),
      kind: "OAUTH",
      name: `gateway-smoke-${marker}`,
      oauthClientId: `gateway-smoke-${marker}`,
      oauthSubject: "gateway-smoke-admin",
      scopes: ["draft:import", "draft:read"],
    },
  })
  const context: McpAuthenticatedContext = {
    credentialId: credential.id,
    clientName: credential.name,
    authType: "oauth",
    scopes: ["draft:import", "draft:read"],
    subject: "gateway-smoke-admin",
  }
  const config = loadMcpSecurityConfig()

  try {
    const session = await createRemoteImportBundle({
      context,
      config,
      value: {
        source_file: "C:\\Users\\owner\\gateway-smoke.md",
        markdown,
        images: [{
          reference: "./cover.png",
          digest: sha256(onePixelPng),
          size: onePixelPng.length,
        }],
      },
    })
    const imageUrl = `http://localhost/api/mcp/imports/${session.bundle_id}/images/0`
    const upload = (token: string, contentType = "application/octet-stream") => uploadImportImage(
      new NextRequest(imageUrl, {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "content-length": String(onePixelPng.length),
          "x-mcp-upload-token": token,
        },
        body: onePixelPng,
      }),
      { params: Promise.resolve({ id: session.bundle_id as string, index: "0" }) }
    )
    assert.equal((await upload("wrong-token")).status, 403)
    assert.equal((await upload(session.upload_token as string, "image/png")).status, 400)
    const uploadResponse = await upload(session.upload_token as string)
    const uploadBody = await uploadResponse.json()
    assert.equal(uploadResponse.status, 200, JSON.stringify(uploadBody))
    assert.deepEqual(uploadBody, { ok: true, index: 0 })

    const duplicateUpload = await upload(session.upload_token as string)
    assert.equal(duplicateUpload.status, 200)
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
    assert.equal(bundle.sourceFile, "gateway-smoke.md")
    assert.ok(bundle.cleanedAt)
    assert.ok(bundle.consumedAt)

    const audit = await prisma.mcpAuditLog.findMany({
      where: { credentialId: credential.id },
    })
    assert.ok(audit.length >= 3)
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(bodyMarker)))
    assert.ok(audit.every((entry) => !JSON.stringify(entry).includes(session.upload_token as string)))

    await assert.rejects(deleteMcpCredential(credential.id), /先撤销/)
    await deleteMcpAuditLog(audit[0].id)
    await deleteMcpApproval(approvalId)
    await revokeMcpCredential(credential.id)
    await deleteMcpCredential(credential.id)
    assert.equal(await prisma.mcpCredential.count({ where: { id: credential.id } }), 0)

    process.stdout.write("MCP production gateway service smoke test passed\n")
  } finally {
    await revokeMcpCredential(credential.id).catch(() => undefined)
    await prisma.$disconnect()
    await rm(uploads, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
