import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"
import { prisma } from "../db"
import { AuthError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../errors"
import { MCP_SCOPES, type McpScope } from "./scopes"
import type { McpAuthenticatedContext } from "./auth-context"
import { credentialDeletionBlockReason } from "./deletion-policy"

export { MCP_SCOPES }
export type { McpScope }

const scryptAsync = promisify(scrypt)
const TOKEN_PREFIX = "qzmcp_v1"

function validateScopes(scopes: readonly string[]): McpScope[] {
  if (scopes.length === 0) throw new ValidationError("至少需要一个 MCP scope")
  const invalid = scopes.filter((scope) => !MCP_SCOPES.includes(scope as McpScope))
  if (invalid.length > 0) throw new ValidationError(`不支持的 MCP scope：${invalid.join(", ")}`)
  return [...new Set(scopes as readonly McpScope[])].sort()
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16)
  const digest = await scryptAsync(secret, salt, 64) as Buffer
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`
}

async function verifySecret(secret: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, digestValue] = encoded.split("$")
  if (algorithm !== "scrypt" || !saltValue || !digestValue) return false
  try {
    const expected = Buffer.from(digestValue, "base64url")
    const actual = await scryptAsync(secret, Buffer.from(saltValue, "base64url"), expected.length) as Buffer
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function parseCredentialToken(token: string): { id: string; secret: string } {
  const match = /^qzmcp_v1_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/i.exec(token)
  if (!match) throw new AuthError("MCP credential 格式无效")
  return { id: match[1].toLowerCase(), secret: match[2] }
}

export function mcpCredentialId(token: string): string {
  return parseCredentialToken(token).id
}

export async function createMcpCredential(nameValue: string) {
  const name = nameValue.trim()
  if (!name || name.length > 80) throw new ValidationError("credential 名称长度必须为 1 到 80 个字符")
  const scopes = validateScopes(["draft:create"])
  const id = randomUUID()
  const secret = randomBytes(32).toString("base64url")
  const secretHash = await hashSecret(secret)
  const credential = await prisma.mcpCredential.create({
    data: { id, kind: "STATIC", name, secretHash, scopes },
    select: { id: true, kind: true, name: true, scopes: true, createdAt: true },
  })
  return { credential, token: `${TOKEN_PREFIX}_${id}_${secret}` }
}

export async function authenticateMcpCredential(token: string) {
  const parsed = parseCredentialToken(token)
  const credential = await prisma.mcpCredential.findUnique({ where: { id: parsed.id } })
  if (!credential || credential.kind !== "STATIC" || credential.revokedAt || !credential.secretHash
    || !await verifySecret(parsed.secret, credential.secretHash)) {
    throw new AuthError("MCP credential 无效或已撤销")
  }
  return prisma.mcpCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  })
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
