import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { requireDailyIntegrationTestDatabaseUrl } from "./daily-integration-test-database"

requireDailyIntegrationTestDatabaseUrl(process.env.DATABASE_URL)

async function main() {
  const { prisma } = await import("../lib/db")
  const { updateDailyQuote, deleteDailyQuote } = await import("../lib/daily")
  const { createMcpApproval, approveMcpApproval } = await import("../lib/mcp/approval-service")
  const marker = randomUUID()
  const originalTransaction = prisma.$transaction.bind(prisma)
  const quoteIds: number[] = []
  let credentialId: string | undefined
  try {
    const current = await prisma.dailyQuote.create({ data: {
      quote: `current-${marker}`, category: "test", normalizedHash: `current-${marker}`, status: true,
      // Use an otherwise unassigned canonical date outside the seed year.
      usedDate: new Date("1900-01-01T00:00:00Z"),
    } })
    const replacement = await prisma.dailyQuote.create({ data: {
      quote: `replacement-${marker}`, category: "test", normalizedHash: `replacement-${marker}`, status: true,
    } })
    quoteIds.push(current.id, replacement.id)
    for (const operation of ["disable", "delete"] as const) {
      let writes = 0
      prisma.$transaction = ((run: (transaction: unknown) => Promise<unknown>) => originalTransaction(async (transaction) => {
        const update = transaction.dailyQuote.update.bind(transaction.dailyQuote)
        transaction.dailyQuote.update = (async (...args: Parameters<typeof update>) => {
          const result = await update(...args)
          if (++writes === 2) throw new Error("injected after date reassignment")
          return result
        }) as unknown as typeof update
        return run(transaction)
      })) as typeof prisma.$transaction
      await assert.rejects(() => operation === "disable"
        ? updateDailyQuote(current.id, { status: false, replacementQuoteId: replacement.id })
        : deleteDailyQuote(current.id, replacement.id), /injected after date reassignment/)
      prisma.$transaction = originalTransaction
      assert.equal(writes, 2)
      const persisted = await prisma.dailyQuote.findUniqueOrThrow({ where: { id: current.id } })
      assert.deepEqual(persisted.usedDate, current.usedDate)
      assert.equal(persisted.status, true)
      assert.equal((await prisma.dailyQuote.findUniqueOrThrow({ where: { id: replacement.id } })).usedDate, null)
    }

    const credential = await prisma.mcpCredential.create({ data: {
      id: marker, name: `test-${marker}`, secretHash: marker, scopes: ["category:create"],
    } })
    credentialId = credential.id
    const approval = await createMcpApproval({
      credentialId: credential.id, toolName: "create_category", requiredScope: "category:create",
      payload: { kind: "create_category", input: { name: `category-${marker}`, type: "BLOG" } },
      parameterSummary: {}, ttlHours: 1,
    })
    prisma.$transaction = ((run: (transaction: unknown) => Promise<unknown>) => originalTransaction(async (transaction) => {
      const update = transaction.mcpApproval.update.bind(transaction.mcpApproval)
      transaction.mcpApproval.update = (async (...args: Parameters<typeof update>) => {
        await update(...args)
        throw new Error("injected after approval completion")
      }) as unknown as typeof update
      return run(transaction)
    })) as typeof prisma.$transaction
    await assert.rejects(() => approveMcpApproval(approval.id), /injected after approval completion/)
    prisma.$transaction = originalTransaction
    assert.equal(await prisma.category.count({ where: { name: `category-${marker}` } }), 0)
    assert.equal(await prisma.mcpExecution.count({ where: { approvalId: approval.id } }), 0)
    const pending = await prisma.mcpApproval.findUniqueOrThrow({ where: { id: approval.id } })
    assert.equal(pending.status, "PENDING_APPROVAL")
    assert.equal(pending.processingAt, null)
    // Retry completes once, then replay must not create another target/execution.
    await approveMcpApproval(approval.id)
    await approveMcpApproval(approval.id)
    assert.equal(await prisma.category.count({ where: { name: `category-${marker}` } }), 1)
    assert.equal(await prisma.mcpExecution.count({ where: { approvalId: approval.id } }), 1)
    console.log("Server domain transaction fault-injection integration passed")
  } finally {
    prisma.$transaction = originalTransaction
    if (credentialId) {
      await prisma.mcpAuditLog.deleteMany({ where: { credentialId } })
      await prisma.mcpExecution.deleteMany({ where: { approval: { credentialId } } })
      await prisma.mcpApproval.deleteMany({ where: { credentialId } })
      await prisma.mcpCredential.deleteMany({ where: { id: credentialId } })
    }
    await prisma.category.deleteMany({ where: { name: `category-${marker}` } })
    await prisma.dailyQuote.deleteMany({ where: { id: { in: quoteIds } } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
