import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"
import { prisma } from "../db"
import { AuthError, NotFoundError, PermissionError, ValidationError } from "../errors"
import { MCP_SCOPES, type McpScope } from "./scopes"

export { MCP_SCOPES }
export type { McpScope }

const scryptAsync = promisify(scrypt)
const TOKEN_PREFIX = "qzmcp_v1"

function validateScopes(scopes: readonly string[]): McpScope[] {
  if (scopes.length === 0) throw new ValidationError("至少需要一个 MCP scope")
  const invalid = scopes.filter((scope) => !MCP_SCOPES.includes(scope as McpScope))
  if (invalid.length > 0) {
    throw new ValidationError(`不支持的 MCP scope：${invalid.join(", ")}`)
  }
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

export async function createMcpCredential(nameValue: string, scopesValue: readonly string[]) {
  const name = nameValue.trim()
  if (!name || name.length > 80) {
    throw new ValidationError("credential 名称长度必须为 1 到 80 个字符")
  }
  const scopes = validateScopes(scopesValue)
  const id = randomUUID()
  const secret = randomBytes(32).toString("base64url")
  const secretHash = await hashSecret(secret)
  const credential = await prisma.mcpCredential.create({
    data: { id, name, secretHash, scopes },
    select: { id: true, name: true, scopes: true, createdAt: true },
  })
  return { credential, token: `${TOKEN_PREFIX}_${id}_${secret}` }
}

export async function authenticateMcpCredential(token: string) {
  const parsed = parseCredentialToken(token)
  const credential = await prisma.mcpCredential.findUnique({ where: { id: parsed.id } })
  if (!credential || credential.revokedAt || !await verifySecret(parsed.secret, credential.secretHash)) {
    throw new AuthError("MCP credential 无效或已撤销")
  }
  await prisma.mcpCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  })
  return credential
}

export function requireMcpScope(
  credential: { scopes: string[] },
  requiredScope: McpScope
) {
  if (!credential.scopes.includes(requiredScope)) {
    throw new PermissionError(`credential 缺少 scope：${requiredScope}`)
  }
}

export async function listMcpCredentials() {
  return prisma.mcpCredential.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  })
}

export async function revokeMcpCredential(id: string) {
  const result = await prisma.mcpCredential.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (result.count === 0) {
    const exists = await prisma.mcpCredential.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundError("MCP credential 不存在")
  }
  return { id, revoked: true }
}
