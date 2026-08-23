import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import {
  createNewQuestionCard,
  deserializeFsrsCard,
  fsrsStateToQuestionState,
  questionFieldsToFsrsCard,
  serializeFsrsCard,
} from "./fsrs"
import { lockQuestionOwner, runQuestionTransaction } from "./database"
import {
  syncQuestionImageReferences,
  validateQuestionMarkdownImages,
} from "./image-references"
import type {
  QuestionCreateInput,
  QuestionListRating,
  QuestionListStatus,
  QuestionPatchInput,
} from "./validation"
import { QUESTION_PAGE_SIZE } from "./validation"

type QuestionRow = Awaited<ReturnType<typeof findOwnedQuestion>>

function isReady(question: { enabled: boolean; referenceAnswerMarkdown: string | null }) {
  return question.enabled && question.referenceAnswerMarkdown !== null
}

export function questionView(question: NonNullable<QuestionRow>) {
  return {
    id: question.id,
    promptMarkdown: question.promptMarkdown,
    referenceAnswerMarkdown: question.referenceAnswerMarkdown,
    enabled: question.enabled,
    ready: isReady(question),
    state: question.state,
    dueAt: question.dueAt.toISOString(),
    newQueueAt: question.newQueueAt?.toISOString() ?? null,
    latestRating: question.latestRating,
    contentVersion: question.contentVersion,
    scheduleVersion: question.scheduleVersion,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  }
}

function questionListView(question: NonNullable<QuestionRow>) {
  return {
    id: question.id,
    promptMarkdown: question.promptMarkdown,
    enabled: question.enabled,
    ready: isReady(question),
    state: question.state,
    dueAt: question.dueAt.toISOString(),
    newQueueAt: question.newQueueAt?.toISOString() ?? null,
    latestRating: question.latestRating,
    contentVersion: question.contentVersion,
    scheduleVersion: question.scheduleVersion,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  }
}

async function findOwnedQuestion(
  ownerId: string,
  id: string,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  return database.question.findFirst({ where: { id, ownerId } })
}

async function requireOwnedQuestion(
  ownerId: string,
  id: string,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  const question = await findOwnedQuestion(ownerId, id, database)
  if (!question) throw new NotFoundError("题目不存在")
  return question
}

function listWhere(
  ownerId: string,
  query?: string,
  status?: QuestionListStatus,
  rating?: QuestionListRating,
  now = new Date()
): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { ownerId }
  const and: Prisma.QuestionWhereInput[] = []

  if (!status || status === "READY") {
    and.push({ enabled: true, referenceAnswerMarkdown: { not: null } })
  } else if (status === "DUE") {
    and.push({
      enabled: true,
      referenceAnswerMarkdown: { not: null },
      state: { not: "NEW" },
      dueAt: { lte: now },
    })
  } else if (status === "FUTURE") {
    and.push({
      enabled: true,
      referenceAnswerMarkdown: { not: null },
      state: { not: "NEW" },
      dueAt: { gt: now },
    })
  } else if (status === "NEW") {
    and.push({ enabled: true, referenceAnswerMarkdown: { not: null }, state: "NEW" })
  } else if (status === "PENDING") {
    and.push({ enabled: true, referenceAnswerMarkdown: null })
  } else if (status === "DISABLED") {
    and.push({ enabled: false })
  }

  if (query) {
    and.push({
      OR: [
        { promptMarkdown: { contains: query, mode: "insensitive" } },
        { referenceAnswerMarkdown: { contains: query, mode: "insensitive" } },
      ],
    })
  }
  if (rating === "NONE") and.push({ latestRating: null })
  else if (rating) and.push({ latestRating: rating })
  if (and.length > 0) where.AND = and
  return where
}

function queueSort(a: NonNullable<QuestionRow>, b: NonNullable<QuestionRow>, now: Date) {
  const priority = (question: NonNullable<QuestionRow>) => {
    if (question.state !== "NEW" && question.dueAt <= now) return 0
    if (question.state !== "NEW") return 1
    return 2
  }
  const difference = priority(a) - priority(b)
  if (difference !== 0) return difference
  const aTime = a.state === "NEW" ? a.newQueueAt?.getTime() ?? Number.MAX_SAFE_INTEGER : a.dueAt.getTime()
  const bTime = b.state === "NEW" ? b.newQueueAt?.getTime() ?? Number.MAX_SAFE_INTEGER : b.dueAt.getTime()
  return aTime - bTime || a.id.localeCompare(b.id)
}

export async function listQuestions(
  ownerId: string,
  input: {
    page: number
    query?: string
    status?: QuestionListStatus
    rating?: QuestionListRating
  },
  now = new Date()
) {
  const where = listWhere(ownerId, input.query, input.status, input.rating, now)
  const [all, pendingCount] = await Promise.all([
    prisma.question.findMany({ where }),
    prisma.question.count({ where: { ownerId, enabled: true, referenceAnswerMarkdown: null } }),
  ])
  all.sort((a, b) => queueSort(a, b, now))
  const start = (input.page - 1) * QUESTION_PAGE_SIZE
  return {
    // The library view deliberately omits the reference answer. It is only
    // returned by the owner-only detail endpoint and by an explicit reveal.
    items: all.slice(start, start + QUESTION_PAGE_SIZE).map(questionListView),
    total: all.length,
    page: input.page,
    pageSize: QUESTION_PAGE_SIZE,
    pendingCount,
  }
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function serializedDue(value: Prisma.JsonValue): string | null {
  const card = jsonObject(value)
  const due = card.due ?? card.dueAt
  if (typeof due === "string") return due
  return null
}

function serializedState(value: Prisma.JsonValue) {
  return fsrsStateToQuestionState(deserializeFsrsCard(value).state)
}

export async function getQuestionHistory(ownerId: string, questionId: string, page = 1) {
  await requireOwnedQuestion(ownerId, questionId)
  const [reviews, resets] = await Promise.all([
    prisma.questionReviewLog.findMany({
      where: { ownerId, questionId },
      select: {
        id: true,
        rating: true,
        source: true,
        stateBefore: true,
        reviewedAt: true,
        beforeCard: true,
        afterCard: true,
        revisionCount: true,
      },
    }),
    prisma.questionScheduleResetLog.findMany({
      where: { ownerId, questionId },
      select: {
        id: true,
        reason: true,
        resetAt: true,
        beforeCard: true,
        afterCard: true,
      },
    }),
  ])

  const events = [
    ...reviews.map((review) => ({
      type: "REVIEW" as const,
      id: review.id,
      at: review.reviewedAt.toISOString(),
      rating: review.rating,
      mode: review.source,
      stateBefore: review.stateBefore,
      stateAfter: serializedState(review.afterCard),
      beforeDueAt: serializedDue(review.beforeCard),
      afterDueAt: serializedDue(review.afterCard),
      reviewRevision: review.revisionCount,
    })),
    ...resets.map((reset) => ({
      type: "RESET" as const,
      id: reset.id,
      at: reset.resetAt.toISOString(),
      reason: reset.reason,
      stateBefore: serializedState(reset.beforeCard),
      stateAfter: serializedState(reset.afterCard),
      beforeDueAt: serializedDue(reset.beforeCard),
      afterDueAt: serializedDue(reset.afterCard),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  const start = (page - 1) * QUESTION_PAGE_SIZE
  return {
    items: events.slice(start, start + QUESTION_PAGE_SIZE),
    total: events.length,
    page,
    pageSize: QUESTION_PAGE_SIZE,
  }
}

export async function getRecentQuestionAttempts(
  ownerId: string,
  questionId: string,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  const attempts = await database.questionAttempt.findMany({
    where: { ownerId, questionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
    include: {
      reviewLog: { select: { rating: true, source: true, reviewedAt: true } },
    },
  })
  return attempts.map((attempt) => ({
    id: attempt.id,
    answerMarkdown: attempt.answerMarkdown,
    rating: attempt.reviewLog.rating,
    mode: attempt.reviewLog.source,
    createdAt: attempt.reviewLog.reviewedAt.toISOString(),
  }))
}

export async function getQuestionDetail(ownerId: string, id: string) {
  const question = await requireOwnedQuestion(ownerId, id)
  const [attempts, timeline] = await Promise.all([
    getRecentQuestionAttempts(ownerId, id),
    getQuestionHistory(ownerId, id, 1),
  ])
  return { question: questionView(question), attempts, timeline }
}

export async function createQuestion(ownerId: string, input: QuestionCreateInput, now = new Date()) {
  const desiredImages = validateQuestionMarkdownImages(
    input.promptMarkdown,
    input.referenceAnswerMarkdown
  )
  const card = createNewQuestionCard(now)
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const question = await transaction.question.create({
      data: {
        ownerId,
        promptMarkdown: input.promptMarkdown,
        referenceAnswerMarkdown: input.referenceAnswerMarkdown,
        enabled: true,
        newQueueAt: input.referenceAnswerMarkdown ? now : null,
        ...card,
      },
    })
    await syncQuestionImageReferences(
      transaction,
      ownerId,
      question.id,
      desiredImages,
      now
    )
    return questionView(question)
  })
}

export async function updateQuestion(
  ownerId: string,
  id: string,
  input: QuestionPatchInput,
  now = new Date()
) {
  if (input.operation === "SET_ENABLED") {
    return runQuestionTransaction(async (transaction) => {
      await lockQuestionOwner(transaction, ownerId)
      await requireOwnedQuestion(ownerId, id, transaction)
      const question = await transaction.question.update({
        where: { id },
        data: { enabled: input.enabled },
      })
      return questionView(question)
    })
  }

  const desiredImages = validateQuestionMarkdownImages(
    input.promptMarkdown,
    input.referenceAnswerMarkdown
  )
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const existing = await requireOwnedQuestion(ownerId, id, transaction)
    if (
      existing.contentVersion !== input.expectedContentVersion
      || existing.scheduleVersion !== input.expectedScheduleVersion
    ) {
      throw new ConflictError("题目已被其他页面修改，请刷新后再保存")
    }
    const wasReady = existing.referenceAnswerMarkdown !== null
    const willBeReady = input.referenceAnswerMarkdown !== null
    if (wasReady && willBeReady) {
      if (input.schedulePolicy === null) {
        throw new ValidationError("已具备标准答案的题目必须选择保留或重置复习进度")
      }
    } else if (input.schedulePolicy !== null) {
      throw new ValidationError("当前答案状态转换不接受复习进度策略")
    }

    const contentVersion = existing.contentVersion + 1
    let scheduleVersion = existing.scheduleVersion
    let nextCard: ReturnType<typeof createNewQuestionCard> | null = null
    let resetReason: "CONTENT_RESET" | "ANSWER_CLEARED" | "ANSWER_COMPLETED" | null = null

    if (!wasReady && willBeReady) resetReason = "ANSWER_COMPLETED"
    else if (wasReady && !willBeReady) resetReason = "ANSWER_CLEARED"
    else if (wasReady && willBeReady && input.schedulePolicy === "RESET") resetReason = "CONTENT_RESET"

    if (resetReason) {
      nextCard = createNewQuestionCard(now)
      scheduleVersion += 1
    }

    const beforeCard = serializeFsrsCard(questionFieldsToFsrsCard(existing))
    const afterCard = nextCard
      ? serializeFsrsCard(questionFieldsToFsrsCard(nextCard))
      : beforeCard
    const question = await transaction.question.update({
      where: { id },
      data: {
        promptMarkdown: input.promptMarkdown,
        referenceAnswerMarkdown: input.referenceAnswerMarkdown,
        contentVersion,
        scheduleVersion,
        ...(nextCard ?? {}),
        ...(resetReason
          ? { newQueueAt: willBeReady ? now : null }
          : !willBeReady
            ? { newQueueAt: null }
            : {}),
      },
    })

    if (resetReason) {
      await transaction.questionScheduleResetLog.create({
        data: {
          ownerId,
          questionId: id,
          reason: resetReason,
          resetAt: now,
          beforeCard: beforeCard as Prisma.InputJsonValue,
          afterCard: afterCard as Prisma.InputJsonValue,
          contentVersionBefore: existing.contentVersion,
          contentVersionAfter: contentVersion,
          scheduleVersionBefore: existing.scheduleVersion,
          scheduleVersionAfter: scheduleVersion,
        },
      })
    }
    await syncQuestionImageReferences(transaction, ownerId, id, desiredImages, now)
    return questionView(question)
  })
}
