import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { addHours, getShanghaiDayWindow } from "./date"
import { lockQuestionOwner, runQuestionTransaction } from "./database"
import { DEFAULT_DAILY_NEW_LIMIT } from "./validation"
import { ReviewConflictError } from "./errors"

type QuestionDatabase = Prisma.TransactionClient | typeof prisma

export type TodayState = "READY" | "WAITING" | "DONE"

async function readPreference(ownerId: string, database: QuestionDatabase) {
  const preference = await database.questionPreference.findUnique({
    where: { userId: ownerId },
    select: { dailyNewLimit: true },
  })
  return { dailyNewLimit: preference?.dailyNewLimit ?? DEFAULT_DAILY_NEW_LIMIT }
}

export async function getQuestionPreference(ownerId: string) {
  return readPreference(ownerId, prisma)
}

export async function updateQuestionPreference(ownerId: string, dailyNewLimit: number) {
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const preference = await transaction.questionPreference.upsert({
      where: { userId: ownerId },
      create: { userId: ownerId, dailyNewLimit },
      update: { dailyNewLimit },
      select: { dailyNewLimit: true },
    })
    return preference
  })
}

async function todayReviewRows(ownerId: string, database: QuestionDatabase, now: Date) {
  const { reviewDate } = getShanghaiDayWindow(now)
  return database.questionReviewLog.findMany({
    where: { ownerId, reviewDate },
    select: {
      questionId: true,
      source: true,
      rating: true,
      stateBefore: true,
    },
  })
}

export async function assertNewQuestionQuotaAvailable(
  ownerId: string,
  database: Prisma.TransactionClient,
  now: Date
) {
  // These helpers also run inside interactive transactions. Keep queries
  // sequential because a transaction owns one pg connection.
  const preference = await readPreference(ownerId, database)
  const rows = await todayReviewRows(ownerId, database, now)
  const introduced = rows.filter((row) => row.stateBefore === "NEW").length
  if (introduced >= preference.dailyNewLimit) {
    throw new ReviewConflictError("今日新题额度已用完，请重新开始队列")
  }
}

export async function getTodayView(
  ownerId: string,
  database: QuestionDatabase = prisma,
  now = new Date()
) {
  const day = getShanghaiDayWindow(now)
  const preference = await readPreference(ownerId, database)
  const rows = await todayReviewRows(ownerId, database, now)
  const dueOldCount = await database.question.count({
      where: {
        ownerId,
        enabled: true,
        referenceAnswerMarkdown: { not: null },
        state: { not: "NEW" },
        dueAt: { lte: now },
      },
    })
  const eligibleNewCount = await database.question.count({
      where: {
        ownerId,
        enabled: true,
        referenceAnswerMarkdown: { not: null },
        state: "NEW",
        newQueueAt: { not: null },
      },
    })
  const nextFuture = await database.question.findFirst({
      where: {
        ownerId,
        enabled: true,
        referenceAnswerMarkdown: { not: null },
        state: { not: "NEW" },
        dueAt: { gt: now, lt: day.end },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      select: { dueAt: true },
    })

  const newIntroducedToday = rows.filter((row) => row.stateBefore === "NEW").length
  const newRemaining = Math.max(0, preference.dailyNewLimit - newIntroducedToday)
  const ratings = { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 }
  let typedCount = 0
  let directRevealCount = 0
  for (const row of rows) {
    ratings[row.rating] += 1
    if (row.source === "TYPED") typedCount += 1
    else directRevealCount += 1
  }

  const state: TodayState = dueOldCount > 0 || (eligibleNewCount > 0 && newRemaining > 0)
    ? "READY"
    : nextFuture
      ? "WAITING"
      : "DONE"

  return {
    summary: {
      dueOldCount,
      newIntroducedToday,
      newRemaining,
      totalActions: rows.length,
      uniqueQuestions: new Set(rows.map((row) => row.questionId)).size,
      typedCount,
      directRevealCount,
      ratings,
    },
    preferences: preference,
    state,
    ...(state === "WAITING" && nextFuture
      ? { nextDueAt: nextFuture.dueAt.toISOString() }
      : {}),
  }
}

async function selectNextQuestion(
  ownerId: string,
  transaction: Prisma.TransactionClient,
  now: Date
) {
  const dueOld = await transaction.question.findFirst({
    where: {
      ownerId,
      enabled: true,
      referenceAnswerMarkdown: { not: null },
      state: { not: "NEW" },
      dueAt: { lte: now },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  })
  if (dueOld) return dueOld

  const preference = await readPreference(ownerId, transaction)
  const rows = await todayReviewRows(ownerId, transaction, now)
  const introduced = rows.filter((row) => row.stateBefore === "NEW").length
  if (introduced >= preference.dailyNewLimit) return null
  return transaction.question.findFirst({
    where: {
      ownerId,
      enabled: true,
      referenceAnswerMarkdown: { not: null },
      state: "NEW",
      newQueueAt: { not: null },
    },
    orderBy: [{ newQueueAt: "asc" }, { id: "asc" }],
  })
}

export async function issueNextTicket(
  ownerId: string,
  transaction: Prisma.TransactionClient,
  now: Date
) {
  const question = await selectNextQuestion(ownerId, transaction, now)
  if (!question) return null
  const ticket = await transaction.questionReviewTicket.create({
    data: {
      ownerId,
      questionId: question.id,
      contentVersion: question.contentVersion,
      scheduleVersion: question.scheduleVersion,
      issuedAt: now,
      expiresAt: addHours(now, 2),
    },
    select: { id: true, reviewKey: true },
  })
  return {
    ticketId: ticket.id,
    question: {
      id: question.id,
      promptMarkdown: question.promptMarkdown,
      reviewKey: ticket.reviewKey,
      contentVersion: question.contentVersion,
      scheduleVersion: question.scheduleVersion,
    },
  }
}

export async function settlePreviousQuestionActions(
  ownerId: string,
  transaction: Prisma.TransactionClient,
  now: Date
) {
  await transaction.questionReviewLog.updateMany({
    where: { ownerId, advancedAt: null, ratingLockedAt: null },
    data: { ratingLockedAt: now, advancedAt: now },
  })
  await transaction.questionReviewLog.updateMany({
    where: { ownerId, advancedAt: null },
    data: { advancedAt: now },
  })
  await transaction.questionReviewTicket.updateMany({
    where: { ownerId, cancelledAt: null, consumedAt: null },
    data: { cancelledAt: now, answerDigest: null },
  })
}

export async function startToday(ownerId: string, now = new Date()) {
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    await settlePreviousQuestionActions(ownerId, transaction, now)
    const issued = await issueNextTicket(ownerId, transaction, now)
    const today = await getTodayView(ownerId, transaction, now)
    if (!issued) return today
    return {
      ...today,
      state: "READY" as const,
      question: issued.question,
    }
  })
}
