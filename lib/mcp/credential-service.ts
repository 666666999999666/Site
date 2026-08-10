import { randomUUID } from "crypto"
import { prisma } from "../db"
import { AuthError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../errors"
import { MCP_SCOPES, type McpScope } from "./scopes"
import type { McpAuthenticatedContext } from "./auth-context"
import { credentialDeletionBlockReason } from "./deletion-policy"

export { MCP_SCOPES }
export type { McpScope }

function validateScopes(scopes: readonly string[]): McpScope[] {
  if (scopes.length === 0) throw new ValidationError("至少需要一个 MCP scope")
  const invalid = scopes.filter((scope) => !MCP_SCOPES.includes(scope as McpScope))
  if (invalid.length > 0) throw new ValidationError(`不支持的 MCP scope：${invalid.join(", ")}`)
  return [...new Set(scopes as readonly McpScope[])].sort()
}

export async function ensureOAuthMcpCredential(input: {
  clientId: string
  subject: string
  name: string
  scopes: readonly string[]
}): Promise<McpAuthenticatedContext> {
  const scopes = validateScopes(input.scopes)
  const name = input.name.trim().slice(0, 80) || "未命名 Agent"
  let credential = await prisma.mcpCredential.findUnique({ where: { oauthClientId: input.clientId } })

  if (!credential) {
    try {
      credential = await prisma.mcpCredential.create({
        data: {
          id: randomUUID(),
          kind: "OAUTH",
          name,
          secretHash: null,
          oauthClientId: input.clientId,
          oauthSubject: input.subject,
          scopes,
          lastUsedAt: new Date(),
        },
      })
    } catch {
      credential = await prisma.mcpCredential.findUnique({ where: { oauthClientId: input.clientId } })
      if (!credential) throw new AuthError("无法建立 OAuth Agent 身份")
    }
  }

  if (credential.kind !== "OAUTH" || credential.oauthSubject !== input.subject || credential.revokedAt) {
    throw new AuthError("OAuth Agent 已撤销或身份不匹配")
  }

  if (credential.name !== name || JSON.stringify(credential.scopes) !== JSON.stringify(scopes)) {
    credential = await prisma.mcpCredential.update({
      where: { id: credential.id },
      data: { name, scopes, lastUsedAt: new Date() },
    })
  } else {
    await prisma.mcpCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    })
  }

  return {
    credentialId: credential.id,
    clientName: name,
    authType: "oauth",
    scopes,
    subject: input.subject,
  }
}

export function requireMcpScope(
  principal: Pick<McpAuthenticatedContext, "scopes"> | { scopes: string[] },
  requiredScope: McpScope
) {
  if (!principal.scopes.includes(requiredScope)) {
    throw new PermissionError(`credential 缺少 scope：${requiredScope}`)
  }
}

export async function listMcpCredentials() {
  return prisma.mcpCredential.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      name: true,
      oauthClientId: true,
      scopes: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      _count: { select: { approvals: true } },
    },
  })
}

export async function revokeMcpCredential(id: string) {
  const credential = await prisma.mcpCredential.findUnique({ where: { id } })
  if (!credential) throw new NotFoundError("MCP credential 不存在")
  if (credential.revokedAt) return { id, revoked: true }

  const now = new Date()
  await prisma.$transaction(async (transaction) => {
    await transaction.mcpCredential.update({ where: { id }, data: { revokedAt: now } })
    if (credential.kind === "OAUTH" && credential.oauthClientId) {
      await transaction.oauthRefreshToken.updateMany({
        where: { clientId: credential.oauthClientId, revoked: null },
        data: { revoked: now },
      })
      await transaction.oauthClient.deleteMany({ where: { clientId: credential.oauthClientId } })
    }
  })
  return { id, revoked: true }
}

export async function deleteMcpCredential(id: string) {
  const credential = await prisma.mcpCredential.findUnique({
    where: { id },
    select: {
      id: true,
      revokedAt: true,
      _count: { select: { approvals: true } },
      importBundles: { select: { id: true, cleanedAt: true } },
    },
  })
  if (!credential) throw new NotFoundError("MCP credential 不存在")
  const blocked = credentialDeletionBlockReason({
    revokedAt: credential.revokedAt,
    approvalCount: credential._count.approvals,
  })
  if (blocked) throw new ConflictError(blocked)

  const activeBundles = credential.importBundles.filter((bundle) => !bundle.cleanedAt)
  if (activeBundles.length > 0) {
    const { cleanupStagedImportBundle } = await import("./import-staging-service")
    for (const bundle of activeBundles) await cleanupStagedImportBundle(bundle.id)
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.mcpImportBundle.deleteMany({ where: { credentialId: id } })
    await transaction.mcpCredential.delete({ where: { id } })
  })
  return { id, deleted: true }
}
