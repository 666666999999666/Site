import assert from "node:assert/strict"
import { prisma, disconnectDatabase } from "../lib/db"
import { createInboxRawHash, parseInboxInput } from "../lib/inbox"
import { captureInboxItem, retryInboxItem } from "../lib/inbox/service"

function assertDisposableDatabase() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")
  const url = new URL(connectionString)
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""))
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"])
  if (!localHosts.has(url.hostname) || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName)) {
    throw new Error("Inbox integration tests only run against a local database whose name contains 'test'")
  }
}

async function createReceivedItem(ownerId: string, requestKey: string, rawInput: string) {
  const parsed = parseInboxInput(rawInput)
  return prisma.inboxItem.create({
    data: {
      ownerId,
      requestKey,
      kind: parsed.kind,
      status: "RECEIVED",
      rawInput,
      rawSha256: createInboxRawHash(rawInput),
      parsedBody: parsed.parsedBody,
      parserVersion: parsed.parserVersion,
      events: {
        create: {
          actorUserId: ownerId,
          eventType: "RECEIVED",
          metadata: { integrationTest: true },
        },
      },
    },
  })
}

async function main() {
  assertDisposableDatabase()
  const suffix = Date.now().toString(36)
  const owner = await prisma.user.create({
    data: {
      username: `inbox-owner-${suffix}`,
      passwordHash: "integration-test-only",
      name: "Inbox Integration Owner",
      email: `inbox-owner-${suffix}@example.test`,
      emailVerified: true,
    },
  })
  const otherOwner = await prisma.user.create({
    data: {
      username: `inbox-other-${suffix}`,
      passwordHash: "integration-test-only",
      name: "Inbox Other Owner",
      email: `inbox-other-${suffix}@example.test`,
      emailVerified: true,
    },
  })

  const articleBody = '{"type":"doc","content":[{"type":"paragraph"}]}\r\n第二行原文'
  const articleRaw = `文章：${articleBody}`
  const article = await captureInboxItem({
    ownerId: owner.id,
    rawInput: articleRaw,
    requestKey: `article-${suffix}`,
  })
  assert.equal(article.status, "APPLIED")
  assert.equal(article.rawInput, articleRaw)
  assert.equal(article.execution?.targetType, "BLOG")
  const post = await prisma.post.findUniqueOrThrow({ where: { id: article.execution!.targetId } })
  assert.equal(post.content, articleBody)
  assert.equal(post.status, "DRAFT")
  assert.equal(post.publishedAt, null)
  assert.equal(post.sourceInboxItemId, article.id)

  const duplicate = await captureInboxItem({
    ownerId: owner.id,
    rawInput: articleRaw,
    requestKey: `article-${suffix}`,
  })
  assert.equal(duplicate.id, article.id)
  assert.equal(duplicate.execution?.targetId, article.execution?.targetId)
  await assert.rejects(() => captureInboxItem({
    ownerId: owner.id,
    rawInput: "文章：不同内容",
    requestKey: `article-${suffix}`,
  }), /requestKey 已用于另一条/)

  const idea = await captureInboxItem({
    ownerId: owner.id,
    rawInput: "idea：# 私人想法\n保留完整正文",
    requestKey: `idea-${suffix}`,
  })
  const formalIdea = await prisma.idea.findUniqueOrThrow({ where: { id: idea.execution!.targetId } })
  assert.equal(formalIdea.ownerId, owner.id)
  assert.equal(formalIdea.title, "私人想法")
  assert.equal(formalIdea.sourceInboxItemId, idea.id)

  const todo = await captureInboxItem({
    ownerId: owner.id,
    rawInput: "todo：完成数据库集成测试\n不猜测日期和优先级",
    requestKey: `todo-${suffix}`,
  })
  const formalTodo = await prisma.todo.findUniqueOrThrow({ where: { id: todo.execution!.targetId } })
  assert.equal(formalTodo.priority, null)
  assert.equal(formalTodo.dueDate, null)
  assert.equal(formalTodo.projectId, null)
  assert.equal(formalTodo.description, "不猜测日期和优先级")

  await assert.rejects(() => retryInboxItem(otherOwner.id, todo.id), /不存在/)
  await assert.rejects(() => prisma.inboxItem.update({
    where: { id: article.id },
    data: { rawInput: "文章：被篡改" },
  }))
  assert.equal(
    (await prisma.inboxItem.findUniqueOrThrow({ where: { id: article.id } })).rawInput,
    articleRaw
  )

  const concurrentItem = await createReceivedItem(
    owner.id,
    `concurrent-${suffix}`,
    "todo：并发重试只创建一个目标"
  )
  const [firstRetry, secondRetry] = await Promise.all([
    retryInboxItem(owner.id, concurrentItem.id),
    retryInboxItem(owner.id, concurrentItem.id),
  ])
  assert.equal(firstRetry.execution?.targetId, secondRetry.execution?.targetId)
  assert.equal(await prisma.inboxExecution.count({ where: { inboxItemId: concurrentItem.id } }), 1)
  assert.equal(await prisma.todo.count({ where: { sourceInboxItemId: concurrentItem.id } }), 1)

  const failedItem = await createReceivedItem(
    owner.id,
    `failure-${suffix}`,
    "文章：强制目标唯一冲突"
  )
  await prisma.post.create({
    data: {
      title: "预占来源",
      content: "仅用于触发测试冲突",
      slug: `occupied-${suffix}`,
      tags: [],
      status: "DRAFT",
      publishedAt: null,
      sourceInboxItemId: failedItem.id,
    },
  })
  const failed = await retryInboxItem(owner.id, failedItem.id)
  assert.equal(failed.status, "FAILED")
  assert.equal(failed.failureCode, "TARGET_CONFLICT")
  assert.equal(failed.rawInput, failedItem.rawInput)
  assert.equal(failed.execution, null)

  await prisma.idea.delete({ where: { id: formalIdea.id } })
  const retainedHistory = await prisma.inboxItem.findUniqueOrThrow({
    where: { id: idea.id },
    include: { execution: true, events: true },
  })
  assert.equal(retainedHistory.rawInput, "idea：# 私人想法\n保留完整正文")
  assert.equal(retainedHistory.execution?.targetId, formalIdea.id)
  assert.ok(retainedHistory.events.some((event) => event.eventType === "APPLIED"))

  console.log("Inbox PostgreSQL integration checks passed")
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDatabase()
  })
