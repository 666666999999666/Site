import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { requireQuestionTestDatabaseUrl } from "./question-test-database"

const { url: connectionString } = requireQuestionTestDatabaseUrl(
  process.env.QUESTION_TEST_DATABASE_URL
)
const concurrentPgQueryWarnings: string[] = []
process.on("warning", (warning) => {
  if (/client\.query\(\) when the client is already executing a query/i.test(warning.message)) {
    concurrentPgQueryWarnings.push(warning.message)
  }
})

async function main() {
process.env.DATABASE_URL = connectionString
const uploadDirectory = await mkdtemp(path.join(os.tmpdir(), "question-school-images-"))
process.env.STUDY_UPLOAD_DIR = uploadDirectory

const {
  createQuestion,
  getQuestionDetail,
  listQuestions,
  updateQuestion,
} = await import("../lib/questions/service")
const {
  getTodayView,
  startToday,
  updateQuestionPreference,
} = await import("../lib/questions/queue")
const {
  advanceQuestion,
  rateQuestion,
  revealQuestion,
} = await import("../lib/questions/review-service")
const {
  createQuestionImage,
  getReadableQuestionImage,
} = await import("../lib/questions/image-service")
const { prisma } = await import("../lib/db")

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const baseNow = new Date("2026-08-23T02:00:00.000Z")
let userId: string | null = null
let otherUserId: string | null = null

function tick(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds)
}

async function cleanup() {
  if (userId || otherUserId) {
    const owners = [userId, otherUserId].filter((value): value is string => Boolean(value))
    await prisma.questionReviewTicket.updateMany({
      where: { ownerId: { in: owners } },
      data: { successorTicketId: null },
    })
    await prisma.questionAttempt.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionReviewLog.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionReviewTicket.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionScheduleResetLog.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionImageReference.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionImage.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.questionPreference.deleteMany({ where: { userId: { in: owners } } })
    await prisma.question.deleteMany({ where: { ownerId: { in: owners } } })
    await prisma.user.deleteMany({ where: { id: { in: owners } } })
  }
  await prisma.$disconnect()
  await rm(uploadDirectory, { recursive: true, force: true })
}

try {
  const user = await prisma.user.create({
    data: {
      username: `question-${suffix}`,
      passwordHash: "test-only-hash",
      name: "Question Test",
      email: `question-${suffix}@example.test`,
    },
  })
  userId = user.id
  const other = await prisma.user.create({
    data: {
      username: `question-other-${suffix}`,
      passwordHash: "test-only-hash",
      name: "Other Question Test",
      email: `question-other-${suffix}@example.test`,
    },
  })
  otherUserId = other.id

  const pending = await createQuestion(user.id, {
    promptMarkdown: "解释 ContextVar 的作用",
    referenceAnswerMarkdown: null,
  }, baseNow)
  assert.equal(pending.ready, false)
  assert.equal((await getTodayView(user.id, prisma, baseNow)).state, "DONE")
  const pendingList = await listQuestions(user.id, { page: 1, status: "PENDING" }, baseNow)
  assert.equal(pendingList.total, 1)
  assert.equal("referenceAnswerMarkdown" in pendingList.items[0]!, false)

  const ready = await updateQuestion(user.id, pending.id, {
    operation: "EDIT_CONTENT",
    promptMarkdown: pending.promptMarkdown,
    referenceAnswerMarkdown: "ContextVar 保存当前异步上下文中的局部状态。",
    schedulePolicy: null,
    expectedContentVersion: pending.contentVersion,
    expectedScheduleVersion: pending.scheduleVersion,
  }, tick(baseNow, 1_000))
  assert.equal(ready.ready, true)
  assert.equal(ready.state, "NEW")
  await assert.rejects(
    updateQuestion(user.id, pending.id, {
      operation: "EDIT_CONTENT",
      promptMarkdown: "另一个标签页里的旧题目",
      referenceAnswerMarkdown: "另一个标签页里的旧答案",
      schedulePolicy: "KEEP",
      expectedContentVersion: pending.contentVersion,
      expectedScheduleVersion: pending.scheduleVersion,
    }, tick(baseNow, 1_500)),
    /其他页面修改/
  )
  assert.equal(
    (await getQuestionDetail(user.id, pending.id)).question.referenceAnswerMarkdown,
    "ContextVar 保存当前异步上下文中的局部状态。"
  )
  assert.equal(await prisma.questionReviewTicket.count({ where: { ownerId: user.id } }), 0)
  const readOnlyToday = await getTodayView(user.id, prisma, tick(baseNow, 2_000))
  assert.equal(readOnlyToday.state, "READY")
  assert.equal(await prisma.questionReviewTicket.count({ where: { ownerId: user.id } }), 0)

  const started = await startToday(user.id, tick(baseNow, 3_000))
  assert.equal(started.state, "READY")
  if (started.state !== "READY" || !("question" in started)) throw new Error("Expected READY question")
  assert.equal(started.question.id, pending.id)
  assert.equal("referenceAnswerMarkdown" in started.question, false)

  const answerOne = "它通过上下文传播隔离每个 Task 的状态。"
  const revealed = await revealQuestion(user.id, started.question.reviewKey, {
    answerMarkdown: answerOne,
    expectedContentVersion: started.question.contentVersion,
    expectedScheduleVersion: started.question.scheduleVersion,
  }, tick(baseNow, 4_000))
  assert.match(revealed.referenceAnswerMarkdown, /异步上下文/)
  const revealedTicket = await prisma.questionReviewTicket.findUniqueOrThrow({
    where: { reviewKey: started.question.reviewKey },
  })
  assert.equal(revealedTicket.consumedAt, null)
  assert.match(revealedTicket.answerDigest ?? "", /^[0-9a-f]{64}$/)

  await assert.rejects(
    revealQuestion(user.id, started.question.reviewKey, {
      answerMarkdown: "   ",
      expectedContentVersion: started.question.contentVersion,
      expectedScheduleVersion: started.question.scheduleVersion,
    }, tick(baseNow, 4_500)),
    /答案正文不能修改/
  )

  await assert.rejects(
    rateQuestion(user.id, started.question.reviewKey, {
      operation: "CREATE",
      answerMarkdown: `${answerOne}（揭晓后篡改）`,
      rating: "GOOD",
      expectedContentVersion: started.question.contentVersion,
      expectedScheduleVersion: started.question.scheduleVersion,
    }, tick(baseNow, 5_000)),
    /答案正文不能修改/
  )

  const rated = await rateQuestion(user.id, started.question.reviewKey, {
    operation: "CREATE",
    answerMarkdown: answerOne,
    rating: "GOOD",
    expectedContentVersion: started.question.contentVersion,
    expectedScheduleVersion: started.question.scheduleVersion,
  }, tick(baseNow, 6_000))
  assert.equal(rated.reviewRevision, 0)
  assert.equal(await prisma.questionReviewLog.count({ where: { ownerId: user.id } }), 1)
  assert.equal(await prisma.questionAttempt.count({ where: { ownerId: user.id } }), 1)
  const consumedTicket = await prisma.questionReviewTicket.findUniqueOrThrow({
    where: { reviewKey: started.question.reviewKey },
  })
  assert.ok(consumedTicket.consumedAt)
  assert.equal(consumedTicket.answerDigest, null)

  const revised = await rateQuestion(user.id, started.question.reviewKey, {
    operation: "REVISE",
    rating: "HARD",
    expectedReviewRevision: 0,
  }, tick(baseNow, 7_000))
  assert.equal(revised.reviewRevision, 1)
  assert.equal(await prisma.questionReviewLog.count({ where: { ownerId: user.id } }), 1)

  const concurrent = await Promise.allSettled([
    rateQuestion(user.id, started.question.reviewKey, {
      operation: "REVISE",
      rating: "AGAIN",
      expectedReviewRevision: 1,
    }, tick(baseNow, 8_000)),
    rateQuestion(user.id, started.question.reviewKey, {
      operation: "REVISE",
      rating: "EASY",
      expectedReviewRevision: 1,
    }, tick(baseNow, 8_000)),
  ])
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1)

  const advanced = await advanceQuestion(user.id, started.question.reviewKey, tick(baseNow, 9_000))
  assert.ok(["WAITING", "DONE"].includes(advanced.state))
  const advancedAgain = await advanceQuestion(user.id, started.question.reviewKey, tick(baseNow, 10_000))
  assert.ok(["WAITING", "DONE"].includes(advancedAgain.state))

  for (const [index, answer] of ["第二次答案", "第三次答案"].entries()) {
    const current = await prisma.question.findUniqueOrThrow({ where: { id: pending.id } })
    const reviewAt = tick(current.dueAt, 1_000 + index * 10_000)
    const next = await startToday(user.id, reviewAt)
    assert.equal(next.state, "READY")
    if (next.state !== "READY" || !("question" in next)) throw new Error("Expected due question")
    await revealQuestion(user.id, next.question.reviewKey, {
      answerMarkdown: answer,
      expectedContentVersion: next.question.contentVersion,
      expectedScheduleVersion: next.question.scheduleVersion,
    }, tick(reviewAt, 1_000))
    await rateQuestion(user.id, next.question.reviewKey, {
      operation: "CREATE",
      answerMarkdown: answer,
      rating: "GOOD",
      expectedContentVersion: next.question.contentVersion,
      expectedScheduleVersion: next.question.scheduleVersion,
    }, tick(reviewAt, 2_000))
    await advanceQuestion(user.id, next.question.reviewKey, tick(reviewAt, 3_000))
  }
  const retained = await prisma.questionAttempt.findMany({
    where: { ownerId: user.id, questionId: pending.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  assert.deepEqual(new Set(retained.map((attempt) => attempt.answerMarkdown)), new Set(["第二次答案", "第三次答案"]))
  assert.equal(retained.length, 2)
  assert.equal(await prisma.questionReviewLog.count({ where: { ownerId: user.id, questionId: pending.id } }), 3)

  await prisma.question.update({
    where: { id: pending.id },
    data: { state: "REVIEW", dueAt: new Date("2099-01-01T00:00:00.000Z"), lastReviewAt: baseNow },
  })
  const directQuestion = await createQuestion(user.id, {
    promptMarkdown: "直接揭晓测试",
    referenceAnswerMarkdown: "直接揭晓必须自动 Again。",
  }, tick(baseNow, 20_000))
  const directStart = await startToday(user.id, tick(baseNow, 21_000))
  assert.equal(directStart.state, "READY")
  if (directStart.state !== "READY" || !("question" in directStart)) throw new Error("Expected direct question")
  assert.equal(directStart.question.id, directQuestion.id)
  const directResult = await revealQuestion(user.id, directStart.question.reviewKey, {
    answerMarkdown: "   ",
    expectedContentVersion: directStart.question.contentVersion,
    expectedScheduleVersion: directStart.question.scheduleVersion,
  }, tick(baseNow, 22_000))
  assert.equal(directResult.directReveal, true)
  assert.equal("rating" in directResult, true)
  if (!("rating" in directResult)) throw new Error("Expected direct reveal rating")
  assert.equal(directResult.rating, "AGAIN")
  const directLog = await prisma.questionReviewLog.findUniqueOrThrow({
    where: { reviewKey: directStart.question.reviewKey },
  })
  assert.equal(directLog.ratingLockedAt !== null, true)
  assert.equal(await prisma.questionAttempt.count({ where: { reviewLogId: directLog.id } }), 0)
  await assert.rejects(
    rateQuestion(user.id, directStart.question.reviewKey, {
      operation: "REVISE",
      rating: "EASY",
      expectedReviewRevision: 0,
    }),
    /不能改档|锁定/
  )

  await advanceQuestion(user.id, directStart.question.reviewKey, tick(baseNow, 23_000))
  await prisma.question.update({
    where: { id: directQuestion.id },
    data: { state: "REVIEW", dueAt: new Date("2099-01-02T00:00:00.000Z"), lastReviewAt: baseNow },
  })
  const staleQuestion = await createQuestion(user.id, {
    promptMarkdown: "版本冲突测试",
    referenceAnswerMarkdown: "旧答案",
  }, tick(baseNow, 24_000))
  const staleStart = await startToday(user.id, tick(baseNow, 25_000))
  assert.equal(staleStart.state, "READY")
  if (staleStart.state !== "READY" || !("question" in staleStart)) throw new Error("Expected stale question")
  assert.equal(staleStart.question.id, staleQuestion.id)
  await updateQuestion(user.id, staleQuestion.id, {
    operation: "EDIT_CONTENT",
    promptMarkdown: "版本冲突测试（已编辑）",
    referenceAnswerMarkdown: "新答案",
    schedulePolicy: "KEEP",
    expectedContentVersion: staleStart.question.contentVersion,
    expectedScheduleVersion: staleStart.question.scheduleVersion,
  }, tick(baseNow, 26_000))
  await assert.rejects(
    revealQuestion(user.id, staleStart.question.reviewKey, {
      answerMarkdown: "我的旧答案",
      expectedContentVersion: staleStart.question.contentVersion,
      expectedScheduleVersion: staleStart.question.scheduleVersion,
    }),
    /状态已变化/
  )

  await updateQuestion(user.id, staleQuestion.id, {
    operation: "SET_ENABLED",
    enabled: false,
  }, tick(baseNow, 27_000))
  const successorSource = await createQuestion(user.id, {
    promptMarkdown: "successor 来源题",
    referenceAnswerMarkdown: "用于创建真实 successor。",
  }, tick(baseNow, 28_000))
  const successorTarget = await createQuestion(user.id, {
    promptMarkdown: "successor 目标题",
    referenceAnswerMarkdown: "编辑后旧 successor 必须失效。",
  }, tick(baseNow, 29_000))
  const successorSourceStart = await startToday(user.id, tick(baseNow, 30_000))
  assert.equal(successorSourceStart.state, "READY")
  if (successorSourceStart.state !== "READY" || !("question" in successorSourceStart)) {
    throw new Error("Expected successor source question")
  }
  assert.equal(successorSourceStart.question.id, successorSource.id)
  await revealQuestion(user.id, successorSourceStart.question.reviewKey, {
    answerMarkdown: "",
    expectedContentVersion: successorSourceStart.question.contentVersion,
    expectedScheduleVersion: successorSourceStart.question.scheduleVersion,
  }, tick(baseNow, 31_000))
  const successorResponse = await advanceQuestion(
    user.id,
    successorSourceStart.question.reviewKey,
    tick(baseNow, 32_000)
  )
  assert.equal(successorResponse.state, "READY")
  if (successorResponse.state !== "READY" || !("question" in successorResponse)) {
    throw new Error("Expected successor target question")
  }
  assert.equal(successorResponse.question.id, successorTarget.id)
  await updateQuestion(user.id, successorTarget.id, {
    operation: "EDIT_CONTENT",
    promptMarkdown: "successor 目标题（已编辑）",
    referenceAnswerMarkdown: "编辑后旧 successor 必须失效。",
    schedulePolicy: "KEEP",
    expectedContentVersion: successorResponse.question.contentVersion,
    expectedScheduleVersion: successorResponse.question.scheduleVersion,
  }, tick(baseNow, 33_000))
  await assert.rejects(
    advanceQuestion(
      user.id,
      successorSourceStart.question.reviewKey,
      tick(baseNow, 34_000)
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "RESYNC_REQUIRED")
      return true
    }
  )

  await updateQuestionPreference(user.id, 1)
  assert.equal((await getTodayView(user.id, prisma, baseNow)).preferences.dailyNewLimit, 1)

  const privateQuestion = await createQuestion(other.id, {
    promptMarkdown: "另一位用户的私有题目",
    referenceAnswerMarkdown: "不可越权读取",
  }, baseNow)
  await assert.rejects(getQuestionDetail(user.id, privateQuestion.id), /题目不存在/)

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZ0AAAAASUVORK5CYII=",
    "base64"
  )
  const image = await createQuestionImage(user.id, new File([png], "pixel.png", { type: "image/png" }))
  await assert.rejects(
    createQuestion(other.id, {
      promptMarkdown: `越权图片\n\n![像素](${image.url})`,
      referenceAnswerMarkdown: "不应创建。",
    }, tick(baseNow, 26_500)),
    /不存在的私有图片/
  )
  const imageQuestion = await createQuestion(user.id, {
    promptMarkdown: `这是什么图？\n\n![像素](${image.url})`,
    referenceAnswerMarkdown: "一个像素图。",
  }, tick(baseNow, 27_000))
  assert.ok(imageQuestion.id)
  const storedImage = await getReadableQuestionImage(user.id, image.id)
  assert.equal(storedImage.body.length, png.length)
  await assert.rejects(getReadableQuestionImage(other.id, image.id), /图片不存在/)
  const imageRow = await prisma.questionImage.findUniqueOrThrow({ where: { id: image.id } })
  assert.equal(imageRow.unreferencedAt, null)
  assert.deepEqual(concurrentPgQueryWarnings, [])

  console.log("Question School integration test passed")
} finally {
  await cleanup()
}
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
