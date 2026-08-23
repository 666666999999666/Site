import { Prisma } from "@/lib/generated/prisma/client"
import { createAnswerDigest, getQuestionReviewDate } from "./domain"
import {
  fsrsCardsEqual,
  QUESTION_FSRS_VERSION,
  reviseQuestionCard,
  scheduleQuestionCard,
  type SerializedFsrsCard,
  type SerializedFsrsParameters,
  type SerializedFsrsReviewLog,
} from "./fsrs"
import { assertAnswerHasNoImages } from "./markdown"
import { lockQuestionOwner, runQuestionTransaction } from "./database"
import { ResyncRequiredError, ReviewConflictError } from "./errors"
import {
  assertNewQuestionQuotaAvailable,
  getTodayView,
  issueNextTicket,
} from "./queue"
import { getRecentQuestionAttempts } from "./service"
import type { RatingRequestInput, RevealInput } from "./validation"

function conflict(message?: string): never {
  throw new ReviewConflictError(message)
}

async function findTicket(
  ownerId: string,
  reviewKey: string,
  transaction: Prisma.TransactionClient
) {
  const ticket = await transaction.questionReviewTicket.findFirst({
    where: { ownerId, reviewKey },
  })
  if (!ticket) return null

  // Keep relation reads sequential inside an interactive transaction. Prisma
  // otherwise expands sibling includes concurrently on the same pg.Client.
  const question = await transaction.question.findUnique({
    where: { id_ownerId: { id: ticket.questionId, ownerId } },
  })
  if (!question) conflict()

  const reviewLog = await transaction.questionReviewLog.findUnique({
    where: {
      reviewKey_questionId_ownerId: {
        reviewKey: ticket.reviewKey,
        questionId: ticket.questionId,
        ownerId,
      },
    },
  })
  const attempt = reviewLog
    ? await transaction.questionAttempt.findUnique({
        where: {
          reviewLogId_questionId_ownerId: {
            reviewLogId: reviewLog.id,
            questionId: ticket.questionId,
            ownerId,
          },
        },
      })
    : null

  const successorTicket = ticket.successorTicketId
    ? await transaction.questionReviewTicket.findUnique({
        where: {
          id_ownerId: { id: ticket.successorTicketId, ownerId },
        },
      })
    : null
  const successorQuestion = successorTicket
    ? await transaction.question.findUnique({
        where: {
          id_ownerId: { id: successorTicket.questionId, ownerId },
        },
      })
    : null
  if (successorTicket && !successorQuestion) conflict()

  return {
    ...ticket,
    question,
    reviewLog: reviewLog ? { ...reviewLog, attempt } : null,
    successorTicket: successorTicket && successorQuestion
      ? { ...successorTicket, question: successorQuestion }
      : null,
  }
}

function assertQuestionCanReview(ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>) {
  const question = ticket.question
  if (!question.enabled || question.referenceAnswerMarkdown === null) {
    conflict("题目当前不可复习，请重新开始队列")
  }
  if (
    question.contentVersion !== ticket.contentVersion ||
    question.scheduleVersion !== ticket.scheduleVersion
  ) {
    conflict()
  }
}

function assertRequestVersions(
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  contentVersion: number,
  scheduleVersion: number
) {
  if (
    contentVersion !== ticket.contentVersion ||
    scheduleVersion !== ticket.scheduleVersion
  ) {
    conflict()
  }
}

function assertConsumedReviewStillCurrent(
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>
) {
  const log = ticket.reviewLog
  if (!log) conflict()
  if (
    !ticket.question.enabled ||
    ticket.question.referenceAnswerMarkdown === null ||
    ticket.question.contentVersion !== log.contentVersion ||
    ticket.question.scheduleVersion !== log.scheduleVersionAfter
  ) {
    conflict()
  }
}

function isExpired(expiresAt: Date, now: Date) {
  return expiresAt.getTime() <= now.getTime()
}

async function revealResponse<T extends Record<string, unknown>>(
  ownerId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  transaction: Prisma.TransactionClient,
  extra: T
) {
  return {
    referenceAnswerMarkdown: ticket.question.referenceAnswerMarkdown!,
    attempts: await getRecentQuestionAttempts(ownerId, ticket.questionId, transaction),
    ...extra,
  }
}

async function createReview(
  ownerId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  transaction: Prisma.TransactionClient,
  input: {
    source: "TYPED" | "DIRECT_REVEAL"
    rating: "AGAIN" | "HARD" | "GOOD" | "EASY"
    answerMarkdown?: string
  },
  now: Date
) {
  const question = ticket.question
  if (question.state === "NEW") {
    await assertNewQuestionQuotaAvailable(ownerId, transaction, now)
  }

  const scheduled = scheduleQuestionCard(question, input.rating, now)
  const scheduleVersionAfter = question.scheduleVersion + 1
  const direct = input.source === "DIRECT_REVEAL"

  await transaction.questionReviewTicket.update({
    where: { id: ticket.id },
    data: {
      revealMode: input.source,
      revealedAt: ticket.revealedAt ?? now,
      consumedAt: now,
      answerDigest: null,
    },
  })
  const reviewLog = await transaction.questionReviewLog.create({
    data: {
      reviewKey: ticket.reviewKey,
      ownerId,
      questionId: question.id,
      source: input.source,
      rating: input.rating,
      stateBefore: scheduled.stateBefore,
      reviewedAt: now,
      reviewDate: getQuestionReviewDate(now),
      beforeCard: scheduled.beforeCard as Prisma.InputJsonValue,
      afterCard: scheduled.afterCard as Prisma.InputJsonValue,
      fsrsReviewLog: scheduled.fsrsReviewLog as Prisma.InputJsonValue,
      schedulerVersion: scheduled.schedulerVersion,
      parametersSnapshot: scheduled.parametersSnapshot as Prisma.InputJsonValue,
      contentVersion: question.contentVersion,
      scheduleVersionBefore: question.scheduleVersion,
      scheduleVersionAfter,
      revisionCount: 0,
      ratingLockedAt: direct ? now : null,
    },
  })
  await transaction.question.update({
    where: { id: question.id },
    data: {
      ...scheduled.questionFields,
      scheduleVersion: scheduleVersionAfter,
      newQueueAt: null,
      latestRating: input.rating,
    },
  })

  if (input.answerMarkdown !== undefined) {
    await transaction.questionAttempt.create({
      data: {
        ownerId,
        questionId: question.id,
        reviewLogId: reviewLog.id,
        answerMarkdown: input.answerMarkdown,
      },
    })
    const stale = await transaction.questionAttempt.findMany({
      where: { ownerId, questionId: question.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 2,
      select: { id: true },
    })
    if (stale.length > 0) {
      await transaction.questionAttempt.deleteMany({
        where: { id: { in: stale.map((attempt) => attempt.id) } },
      })
    }
  }

  return {
    reviewLog,
    scheduled,
  }
}

export async function revealQuestion(
  ownerId: string,
  reviewKey: string,
  input: RevealInput,
  now = new Date()
) {
  assertAnswerHasNoImages(input.answerMarkdown)
  const answerDigest = createAnswerDigest(input.answerMarkdown)
  const direct = input.answerMarkdown.trim() === ""

  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const ticket = await findTicket(ownerId, reviewKey, transaction)
    if (!ticket || ticket.cancelledAt) conflict()
    assertRequestVersions(
      ticket,
      input.expectedContentVersion,
      input.expectedScheduleVersion
    )

    if (ticket.reviewLog) {
      assertConsumedReviewStillCurrent(ticket)
      if (ticket.reviewLog.advancedAt) conflict()
      if (ticket.reviewLog.source === "DIRECT_REVEAL") {
        if (!direct) conflict("该题已按直接揭晓记为重来")
        return revealResponse(ownerId, ticket, transaction, {
          directReveal: true,
          rating: "AGAIN",
          reviewRevision: ticket.reviewLog.revisionCount,
        })
      }
      if (direct || ticket.reviewLog.attempt?.answerMarkdown !== input.answerMarkdown) {
        conflict("揭晓后的答案正文不能修改")
      }
      return revealResponse(ownerId, ticket, transaction, {
        directReveal: false,
        rating: ticket.reviewLog.rating,
        reviewRevision: ticket.reviewLog.revisionCount,
      })
    }

    assertQuestionCanReview(ticket)
    if (isExpired(ticket.expiresAt, now)) conflict("本题已过期，请重新开始队列")
    if (ticket.consumedAt) conflict()

    if (ticket.revealMode !== null) {
      if (
        ticket.revealMode !== "TYPED"
        || direct
        || ticket.answerDigest !== answerDigest
      ) {
        conflict("揭晓后的答案正文不能修改")
      }
      return revealResponse(ownerId, ticket, transaction, { directReveal: false })
    }

    if (direct) {
      const created = await createReview(ownerId, ticket, transaction, {
        source: "DIRECT_REVEAL",
        rating: "AGAIN",
      }, now)
      return revealResponse(ownerId, ticket, transaction, {
        directReveal: true,
        rating: "AGAIN",
        reviewRevision: created.reviewLog.revisionCount,
      })
    }

    await transaction.questionReviewTicket.update({
      where: { id: ticket.id },
      data: {
        revealMode: "TYPED",
        revealedAt: now,
        answerDigest,
      },
    })
    return revealResponse(ownerId, ticket, transaction, { directReveal: false })
  })
}

async function createTypedRating(
  ownerId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  input: Extract<RatingRequestInput, { operation: "CREATE" }>,
  transaction: Prisma.TransactionClient,
  now: Date
) {
  assertAnswerHasNoImages(input.answerMarkdown)
  if (input.answerMarkdown.trim() === "") {
    conflict("空白答案只能使用直接揭晓")
  }
  assertRequestVersions(ticket, input.expectedContentVersion, input.expectedScheduleVersion)

  if (ticket.reviewLog) {
    assertConsumedReviewStillCurrent(ticket)
    const matches = ticket.reviewLog.source === "TYPED"
      && ticket.reviewLog.rating === input.rating
      && ticket.reviewLog.contentVersion === input.expectedContentVersion
      && ticket.reviewLog.scheduleVersionBefore === input.expectedScheduleVersion
      && ticket.reviewLog.attempt?.answerMarkdown === input.answerMarkdown
    if (!matches) conflict()
    return {
      rating: ticket.reviewLog.rating,
      reviewRevision: ticket.reviewLog.revisionCount,
    }
  }
  assertQuestionCanReview(ticket)
  if (ticket.cancelledAt || ticket.consumedAt || isExpired(ticket.expiresAt, now)) conflict()
  if (ticket.revealMode !== "TYPED" || !ticket.answerDigest) {
    conflict("请先对照标准答案")
  }
  if (ticket.answerDigest !== createAnswerDigest(input.answerMarkdown)) {
    conflict("揭晓后的答案正文不能修改")
  }

  const created = await createReview(ownerId, ticket, transaction, {
    source: "TYPED",
    rating: input.rating,
    answerMarkdown: input.answerMarkdown,
  }, now)
  return {
    rating: created.reviewLog.rating,
    reviewRevision: created.reviewLog.revisionCount,
    dueAt: created.scheduled.questionFields.dueAt.toISOString(),
    state: created.scheduled.questionFields.state,
  }
}

async function reviseTypedRating(
  ownerId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  input: Extract<RatingRequestInput, { operation: "REVISE" }>,
  transaction: Prisma.TransactionClient
) {
  const log = ticket.reviewLog
  const question = ticket.question
  if (!log || log.source !== "TYPED") conflict("该复习动作不能改档")
  if (log.ratingLockedAt || log.advancedAt) conflict("评分已经锁定")
  if (!question.enabled || question.referenceAnswerMarkdown === null) conflict()
  if (
    question.contentVersion !== log.contentVersion ||
    question.scheduleVersion !== log.scheduleVersionAfter ||
    log.schedulerVersion !== QUESTION_FSRS_VERSION ||
    !fsrsCardsEqual(question, log.afterCard as unknown as SerializedFsrsCard)
  ) {
    conflict()
  }

  if (input.rating === log.rating) {
    if (
      input.expectedReviewRevision === log.revisionCount ||
      input.expectedReviewRevision === log.revisionCount - 1
    ) {
      return { rating: log.rating, reviewRevision: log.revisionCount }
    }
    conflict()
  }
  if (input.expectedReviewRevision !== log.revisionCount) conflict()

  const revised = reviseQuestionCard(
    question,
    log.fsrsReviewLog as unknown as SerializedFsrsReviewLog,
    input.rating,
    log.parametersSnapshot as unknown as SerializedFsrsParameters
  )
  const updatedLog = await transaction.questionReviewLog.updateMany({
    where: {
      id: log.id,
      ownerId,
      revisionCount: input.expectedReviewRevision,
      ratingLockedAt: null,
      advancedAt: null,
    },
    data: {
      rating: input.rating,
      afterCard: revised.afterCard as Prisma.InputJsonValue,
      fsrsReviewLog: revised.fsrsReviewLog as Prisma.InputJsonValue,
      revisionCount: { increment: 1 },
    },
  })
  if (updatedLog.count !== 1) conflict()
  const updatedQuestion = await transaction.question.updateMany({
    where: {
      id: question.id,
      ownerId,
      contentVersion: log.contentVersion,
      scheduleVersion: log.scheduleVersionAfter,
    },
    data: {
      ...revised.questionFields,
      latestRating: input.rating,
    },
  })
  if (updatedQuestion.count !== 1) conflict()
  return {
    rating: input.rating,
    reviewRevision: log.revisionCount + 1,
    dueAt: revised.questionFields.dueAt.toISOString(),
    state: revised.questionFields.state,
  }
}

export async function rateQuestion(
  ownerId: string,
  reviewKey: string,
  input: RatingRequestInput,
  now = new Date()
) {
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const ticket = await findTicket(ownerId, reviewKey, transaction)
    if (!ticket) conflict()
    return input.operation === "CREATE"
      ? createTypedRating(ownerId, ticket, input, transaction, now)
      : reviseTypedRating(ownerId, ticket, input, transaction)
  })
}

function activeSuccessor(
  ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>,
  now: Date
) {
  const successor = ticket.successorTicket
  if (!successor) return null
  if (
    successor.cancelledAt
    || successor.consumedAt
    || isExpired(successor.expiresAt, now)
    || !successor.question.enabled
    || successor.question.referenceAnswerMarkdown === null
    || successor.question.contentVersion !== successor.contentVersion
    || successor.question.scheduleVersion !== successor.scheduleVersion
  ) {
    throw new ResyncRequiredError()
  }
  return successor
}

export async function advanceQuestion(ownerId: string, reviewKey: string, now = new Date()) {
  return runQuestionTransaction(async (transaction) => {
    await lockQuestionOwner(transaction, ownerId)
    const ticket = await findTicket(ownerId, reviewKey, transaction)
    if (!ticket) conflict()

    const successor = activeSuccessor(ticket, now)
    if (successor) {
      const today = await getTodayView(ownerId, transaction, now)
      return {
        ...today,
        state: "READY" as const,
        question: {
          id: successor.question.id,
          promptMarkdown: successor.question.promptMarkdown,
          reviewKey: successor.reviewKey,
          contentVersion: successor.contentVersion,
          scheduleVersion: successor.scheduleVersion,
        },
      }
    }

    let alreadySettled = false
    if (ticket.consumedAt) {
      const log = ticket.reviewLog
      if (!log) conflict()
      alreadySettled = log.advancedAt !== null
      if (!alreadySettled) {
        await transaction.questionReviewLog.update({
          where: { id: log.id },
          data: {
            ratingLockedAt: log.ratingLockedAt ?? now,
            advancedAt: now,
          },
        })
      }
    } else if (ticket.cancelledAt) {
      alreadySettled = true
    } else {
      await transaction.questionReviewTicket.update({
        where: { id: ticket.id },
        data: { cancelledAt: now, answerDigest: null },
      })
    }

    if (alreadySettled) {
      const today = await getTodayView(ownerId, transaction, now)
      if (today.state === "READY") throw new ResyncRequiredError()
      return today
    }

    const issued = await issueNextTicket(ownerId, transaction, now)
    const today = await getTodayView(ownerId, transaction, now)
    if (!issued) return today
    await transaction.questionReviewTicket.update({
      where: { id: ticket.id },
      data: { successorTicketId: issued.ticketId },
    })
    return {
      ...today,
      state: "READY" as const,
      question: issued.question,
    }
  })
}
