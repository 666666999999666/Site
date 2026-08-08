import { prisma } from "../db"
import { RateLimitError } from "../errors"
import type { Prisma } from "../generated/prisma/client"

function minuteWindow(now: Date): Date {
  const result = new Date(now)
  result.setUTCSeconds(0, 0)
  return result
}

async function incrementBucket(
  transaction: Prisma.TransactionClient,
  credentialId: string,
  toolName: string,
  windowStart: Date
) {
  return transaction.mcpRateLimit.upsert({
    where: {
      credentialId_toolName_windowStart: { credentialId, toolName, windowStart },
    },
    create: { credentialId, toolName, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  })
}

export async function consumeMcpRateLimit(input: {
  credentialId: string
  toolName: string
  credentialLimit: number
  toolLimit: number
  now?: Date
}) {
  const windowStart = minuteWindow(input.now ?? new Date())
  await prisma.$transaction(async (transaction) => {
    const [credentialBucket, toolBucket] = await Promise.all([
      incrementBucket(transaction, input.credentialId, "*", windowStart),
      incrementBucket(transaction, input.credentialId, input.toolName, windowStart),
    ])
    if (credentialBucket.count > input.credentialLimit) {
      throw new RateLimitError("MCP credential 每分钟调用次数已达上限")
    }
    if (toolBucket.count > input.toolLimit) {
      throw new RateLimitError(`MCP tool ${input.toolName} 每分钟调用次数已达上限`)
    }
  })
}

export async function cleanupMcpRateLimits(now = new Date()) {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return prisma.mcpRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } })
}
