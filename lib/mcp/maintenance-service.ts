import { prisma } from "../db"
import { cleanupExpiredMcpApprovals } from "./approval-service"
import { recoverInterruptedMcpAudits } from "./audit-service"
import { cleanupExpiredImportBundles } from "./import-staging-service"
import { cleanupMcpRateLimits } from "./rate-limit-service"

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000
const DCR_ABANDONED_MS = 24 * 60 * 60 * 1000

type MaintenanceState = {
  lastStartedAt: number
  running: Promise<McpMaintenanceResult> | null
}

export interface McpMaintenanceResult {
  expiredApprovals: number
  expiredBundles: number
  interruptedAudits: number
  rateLimitBuckets: number
  abandonedOAuthClients: number
  expiredOAuthArtifacts: number
}

const globalForMaintenance = globalThis as unknown as {
  qzMcpMaintenance?: MaintenanceState
}

const state = globalForMaintenance.qzMcpMaintenance ?? {
  lastStartedAt: 0,
  running: null,
}
globalForMaintenance.qzMcpMaintenance = state

function emptyMaintenanceResult(): McpMaintenanceResult {
  return {
    expiredApprovals: 0,
    expiredBundles: 0,
    interruptedAudits: 0,
    rateLimitBuckets: 0,
    abandonedOAuthClients: 0,
    expiredOAuthArtifacts: 0,
  }
}

async function cleanupAbandonedOAuthClients(now: Date): Promise<number> {
  const candidates = await prisma.oauthClient.findMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - DCR_ABANDONED_MS) },
      userId: null,
      refreshTokens: { none: {} },
      accessTokens: { none: {} },
    },
    select: { clientId: true },
    take: 100,
  })
  if (candidates.length === 0) return 0
  const connected = await prisma.mcpCredential.findMany({
    where: { oauthClientId: { in: candidates.map((client) => client.clientId) } },
    select: { oauthClientId: true },
  })
  const connectedIds = new Set(connected.map((item) => item.oauthClientId))
  const abandoned = candidates
    .map((client) => client.clientId)
    .filter((clientId) => !connectedIds.has(clientId))
  if (abandoned.length === 0) return 0
  const result = await prisma.oauthClient.deleteMany({ where: { clientId: { in: abandoned } } })
  return result.count
}

async function performMaintenance(now: Date): Promise<McpMaintenanceResult> {
  const expiredApprovals = await cleanupExpiredMcpApprovals()
  const expiredBundles = await cleanupExpiredImportBundles()
  const [interruptedAudits, rateLimitBuckets, abandonedOAuthClients] = await Promise.all([
    recoverInterruptedMcpAudits(now),
    cleanupMcpRateLimits(now),
    cleanupAbandonedOAuthClients(now),
  ])

  const revokedRefreshCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [accessTokens, refreshTokens, verifications, sessions] = await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oauthRefreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revoked: { lt: revokedRefreshCutoff } },
        ],
      },
    }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ])

  return {
    expiredApprovals,
    expiredBundles,
    interruptedAudits: interruptedAudits.count,
    rateLimitBuckets: rateLimitBuckets.count,
    abandonedOAuthClients,
    expiredOAuthArtifacts: accessTokens.count + refreshTokens.count + verifications.count + sessions.count,
  }
}

export function runMcpMaintenance(input: { force?: boolean; now?: Date } = {}): Promise<McpMaintenanceResult> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return Promise.resolve(emptyMaintenanceResult())
  }
  const now = input.now ?? new Date()
  if (state.running) return state.running
  if (!input.force && now.getTime() - state.lastStartedAt < MAINTENANCE_INTERVAL_MS) {
    return Promise.resolve(emptyMaintenanceResult())
  }

  state.lastStartedAt = now.getTime()
  state.running = performMaintenance(now).finally(() => {
    state.running = null
  })
  return state.running
}
