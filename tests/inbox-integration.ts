import assert from "node:assert/strict"
import { createInboxRawHash, parseInboxInput } from "../lib/inbox"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"

type TestDatabase = typeof import("../lib/db").prisma

async function createReceivedItem(
  prisma: TestDatabase,
  ownerId: string,
  requestKey: string,
  rawInput: string
) {
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

async function runIntegration(prisma: TestDatabase) {
  const { captureInboxItem, deleteInboxItem, retryInboxItem } = await import("../lib/inbox/service")
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

  const { getIdea, searchIdeas, updateIdea, convertIdea } = await import("../lib/ideas")
  const { ideaConversionSchema } = await import("../lib/ideas-validation")
  const initialTodoCount = await prisma.todo.count()
  const materialInputs = [
    "  一段随想\r\n不想现在就执行  ", "https://example.test/reading", "一个没想明白的问题？",
    "- 买书\n- 看视频\n只是以后可能想做", "今天有点累，先记在这里", "todo：这是摘录，不是任务", "文章：这是素材，不是草稿",
  ]
  const materialIds: string[] = []
  for (const [index, rawInput] of materialInputs.entries()) {
    const item = await captureInboxItem({ ownerId: owner.id, rawInput, requestKey: `material-${suffix}-${index}`, source: "integration", forceMaterial: true })
    assert.equal(item.execution?.targetType, "IDEA")
    const record = await getIdea(owner.id, item.execution!.targetId)
    materialIds.push(record.id)
    assert.equal(record.rawInput, rawInput)
    assert.equal(record.source, "integration")
    assert.equal(record.discussionStatus, "STORED")
    assert.equal(record.capturedAt.getTime(), item.createdAt.getTime())
  }
  assert.equal(await prisma.todo.count(), initialTodoCount)
  for (const id of materialIds.slice(0, 2)) await updateIdea(owner.id, id, { discussionStatus: "WANT_DISCUSS", discussionSummary: "下次接着聊" })
  assert.equal((await searchIdeas(owner.id, {discussionStatus:"WANT_DISCUSS"})).length, 2)
  await updateIdea(owner.id, materialIds[0], {title:"整理后的标题",content:"AI 对原文的解释",discussionStatus:"DISCUSSED",discussionSummary:"已有初步结论"})
  assert.equal((await getIdea(owner.id,materialIds[0])).rawInput, materialInputs[0])
  assert.equal((await searchIdeas(owner.id,{q:"一段随想"}))[0].id, materialIds[0])
  await updateIdea(owner.id, materialIds[1], {discussionStatus:"ARCHIVED"})
  await updateIdea(owner.id, materialIds[1], {discussionStatus:"WANT_DISCUSS"})
  await assert.rejects(() => getIdea(otherOwner.id, materialIds[0]), /不存在/)
  await assert.rejects(() => updateIdea(otherOwner.id, materialIds[0], {discussionStatus:"ARCHIVED"}), /不存在/)
  assert.equal((await searchIdeas(otherOwner.id, {})).length, 0)
  await assert.rejects(() => prisma.idea.update({where:{id:materialIds[0]},data:{rawInput:"tampered"}}))
  for (const field of ["source", "capturedAt"] as const) await assert.rejects(() => prisma.idea.update({where:{id:materialIds[0]},data: field === "source" ? {source:"changed"} : {capturedAt:new Date(0)}}))
  for (const targetType of ["TODO", "BLOG"] as const) {
    const conversionInput = ideaConversionSchema.parse({targetType,requestKey:`conversion-${suffix}-${targetType}`,title:"明确选择才转换",...(targetType === "BLOG" ? {content:"草稿正文"} : {description:"一个任务"})})
    const [a,b] = await Promise.all([convertIdea(owner.id, materialIds[0], conversionInput),convertIdea(owner.id, materialIds[0], conversionInput)])
    assert.equal(a.targetId,b.targetId)
    await assert.rejects(() => convertIdea(owner.id, materialIds[0], {...conversionInput,title:"changed proposal"}), /不同内容/)
    assert.equal(await prisma.ideaConversion.count({where:{ideaId:materialIds[0],targetType}}),1)
    assert.ok(a.href.startsWith(targetType === "TODO" ? "/admin/todos?status=ALL#todo-" : "/admin/posts/"))
    if (targetType === "BLOG") assert.equal((await prisma.post.findUniqueOrThrow({where:{id:a.targetId}})).status,"DRAFT")
    await assert.rejects(() => convertIdea(otherOwner.id, materialIds[0], conversionInput),/不存在/)
  }
  const linked = await getIdea(owner.id,materialIds[0])
  assert.equal(linked.conversions.length,2)
  assert.ok(linked.conversions.some((link) => link.post?.title === "明确选择才转换"))
  assert.ok(linked.conversions.some((link) => link.todo?.title === "明确选择才转换"))
  const keptRaw = (await getIdea(owner.id,materialIds[2])).rawInput
  const rawRecord = await prisma.idea.findUniqueOrThrow({where:{id:materialIds[2]}})
  await deleteInboxItem(owner.id,rawRecord.sourceInboxItemId!)
  assert.equal((await getIdea(owner.id,materialIds[2])).rawInput,keptRaw)

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
    prisma,
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
    prisma,
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

  await assert.rejects(() => deleteInboxItem(otherOwner.id, article.id), /不存在/)
  assert.ok(await prisma.inboxItem.findUnique({ where: { id: article.id } }))

  await deleteInboxItem(owner.id, article.id)
  assert.equal(await prisma.inboxItem.findUnique({ where: { id: article.id } }), null)
  assert.equal(await prisma.inboxExecution.count({ where: { inboxItemId: article.id } }), 0)
  assert.equal(await prisma.inboxEvent.count({ where: { inboxItemId: article.id } }), 0)
  const retainedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
  assert.equal(retainedPost.sourceInboxItemId, null)

  console.log("Inbox PostgreSQL integration checks passed")
}

async function main() {
  requireInboxTestDatabaseUrl(process.env.DATABASE_URL)
  const { prisma, disconnectDatabase } = await import("../lib/db")
  try {
    await runIntegration(prisma)
  } finally {
    await disconnectDatabase()
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
