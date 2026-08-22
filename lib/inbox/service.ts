import { prisma } from "../db"
import { ConflictError, NotFoundError } from "../errors"
import { Prisma } from "../generated/prisma/client"
import { calculateReadTime, generateUniqueSlug } from "../posts"
import { mapInboxBlog, mapInboxIdea, mapInboxTodo } from "./mapping"
import {
  assertInboxRequestKey,
  createInboxRawHash,
  parseInboxInput,
} from "./parser"

export const inboxItemDetailInclude = {
  execution: true,
  events: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.InboxItemInclude

export type InboxItemDetail = Prisma.InboxItemGetPayload<{
  include: typeof inboxItemDetailInclude
}>

export interface CaptureInboxItemInput {
  ownerId: string
  rawInput: string
  requestKey: string
}

const APPLY_FAILURE_MESSAGE = "正式内容创建失败，请稍后重试"

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

function failureCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "TARGET_CONFLICT"
    if (error.code === "P2003") return "TARGET_RELATION_INVALID"
  }
  return "TARGET_CREATE_FAILED"
}

async function findInboxItem(ownerId: string, itemId: string) {
  return prisma.inboxItem.findFirst({
    where: { id: itemId, ownerId },
    include: inboxItemDetailInclude,
  })
}

async function lockInboxItem(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  itemId: string
) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "InboxItem"
    WHERE "id" = ${itemId} AND "ownerId" = ${ownerId}
    FOR UPDATE
  `
  if (rows.length !== 1) throw new NotFoundError("收件箱记录不存在")
}

async function reconcileExistingExecution(
  transaction: Prisma.TransactionClient,
  itemId: string,
  ownerId: string
) {
  const current = await transaction.inboxItem.findUniqueOrThrow({
    where: { id: itemId },
    include: inboxItemDetailInclude,
  })
  if (!current.execution || current.status === "APPLIED") return current

  await transaction.inboxEvent.create({
    data: {
      inboxItemId: itemId,
      actorUserId: ownerId,
      eventType: "APPLICATION_RECONCILED",
      metadata: {
        targetType: current.execution.targetType,
        targetId: current.execution.targetId,
      },
    },
  })
  return transaction.inboxItem.update({
    where: { id: itemId },
    data: {
      status: "APPLIED",
      failureCode: null,
      failureMessage: null,
      appliedAt: current.execution.createdAt,
    },
    include: inboxItemDetailInclude,
  })
}

export async function createFormalTarget(
  transaction: Prisma.TransactionClient,
  item: Prisma.InboxItemGetPayload<Record<string, never>>
) {
  switch (item.kind) {
    case "BLOG": {
      const mapped = mapInboxBlog(item.parsedBody)
      const content = mapped.content
      const post = await transaction.post.create({
        data: {
          title: mapped.title,
          content,
          excerpt: null,
          slug: await generateUniqueSlug(mapped.title, transaction),
          categoryId: null,
          tags: [],
          coverImage: null,
          status: "DRAFT",
          readTime: calculateReadTime(content),
          publishedAt: null,
          sourceInboxItemId: item.id,
        },
        select: { id: true },
      })
      return { targetType: "BLOG" as const, targetId: post.id }
    }
    case "IDEA": {
      const mapped = mapInboxIdea(item.parsedBody)
      const idea = await transaction.idea.create({
        data: {
          ownerId: item.ownerId,
          title: mapped.title,
          content: mapped.content,
          tags: mapped.tags,
          sourceInboxItemId: item.id,
        },
        select: { id: true },
      })
      return { targetType: "IDEA" as const, targetId: idea.id }
    }
    case "TODO": {
      const mapped = mapInboxTodo(item.parsedBody)
      const todo = await transaction.todo.create({
        data: {
          title: mapped.title,
          description: mapped.description,
          categoryId: null,
          status: "TODO",
          priority: null,
          dueDate: null,
          projectId: null,
          completionCriteria: null,
          sourceInboxItemId: item.id,
        },
        select: { id: true },
      })
      return { targetType: "TODO" as const, targetId: todo.id }
    }
  }
}

async function applyInboxItem(ownerId: string, itemId: string): Promise<InboxItemDetail> {
  try {
    return await prisma.$transaction(async (transaction) => {
      await lockInboxItem(transaction, ownerId, itemId)
      const item = await transaction.inboxItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { execution: true },
      })

      if (item.execution) {
        return reconcileExistingExecution(transaction, itemId, ownerId)
      }

      const target = await createFormalTarget(transaction, item)
      const appliedAt = new Date()
      await transaction.inboxExecution.create({
        data: {
          inboxItemId: item.id,
          targetType: target.targetType,
          targetId: target.targetId,
        },
      })
      await transaction.inboxEvent.create({
        data: {
          inboxItemId: item.id,
          actorUserId: ownerId,
          eventType: "APPLIED",
          metadata: target,
        },
      })
      return transaction.inboxItem.update({
        where: { id: item.id },
        data: {
          status: "APPLIED",
          failureCode: null,
          failureMessage: null,
          appliedAt,
        },
        include: inboxItemDetailInclude,
      })
    })
  } catch (error) {
    if (error instanceof NotFoundError) throw error
    return recordApplyFailure(ownerId, itemId, failureCode(error))
  }
}

async function recordApplyFailure(
  ownerId: string,
  itemId: string,
  code: string
): Promise<InboxItemDetail> {
  return prisma.$transaction(async (transaction) => {
    await lockInboxItem(transaction, ownerId, itemId)
    const item = await transaction.inboxItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { execution: true },
    })

    if (item.execution) {
      return reconcileExistingExecution(transaction, itemId, ownerId)
    }

    await transaction.inboxEvent.create({
      data: {
        inboxItemId: itemId,
        actorUserId: ownerId,
        eventType: "APPLY_FAILED",
        metadata: { failureCode: code },
      },
    })
    return transaction.inboxItem.update({
      where: { id: itemId },
      data: {
        status: "FAILED",
        failureCode: code,
        failureMessage: APPLY_FAILURE_MESSAGE,
        appliedAt: null,
      },
      include: inboxItemDetailInclude,
    })
  })
}

export async function captureInboxItem(
  input: CaptureInboxItemInput
): Promise<InboxItemDetail> {
  const parsed = parseInboxInput(input.rawInput)
  const requestKey = assertInboxRequestKey(input.requestKey)
  const rawSha256 = createInboxRawHash(input.rawInput)

  let item: InboxItemDetail
  try {
    item = await prisma.inboxItem.create({
      data: {
        ownerId: input.ownerId,
        kind: parsed.kind,
        status: "RECEIVED",
        rawInput: input.rawInput,
        rawSha256,
        parsedBody: parsed.parsedBody,
        parserVersion: parsed.parserVersion,
        requestKey,
        events: {
          create: {
            actorUserId: input.ownerId,
            eventType: "RECEIVED",
            metadata: {
              kind: parsed.kind,
              parserVersion: parsed.parserVersion,
            },
          },
        },
      },
      include: inboxItemDetailInclude,
    })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    const existing = await prisma.inboxItem.findUnique({
      where: {
        ownerId_requestKey: { ownerId: input.ownerId, requestKey },
      },
      include: inboxItemDetailInclude,
    })
    if (!existing) throw error
    if (existing.rawSha256 !== rawSha256) {
      throw new ConflictError("requestKey 已用于另一条收件箱内容")
    }
    item = existing
  }

  if (item.status === "RECEIVED") {
    return applyInboxItem(input.ownerId, item.id)
  }
  return item
}

export async function retryInboxItem(ownerId: string, itemId: string): Promise<InboxItemDetail> {
  const item = await findInboxItem(ownerId, itemId)
  if (!item) throw new NotFoundError("收件箱记录不存在")
  if (item.execution || item.status === "APPLIED") return item

  await prisma.inboxEvent.create({
    data: {
      inboxItemId: item.id,
      actorUserId: ownerId,
      eventType: "RETRY_REQUESTED",
      metadata: item.failureCode ? { previousFailureCode: item.failureCode } : undefined,
    },
  })
  return applyInboxItem(ownerId, item.id)
}

export async function deleteInboxItem(ownerId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await lockInboxItem(transaction, ownerId, itemId)

    await transaction.post.updateMany({
      where: { sourceInboxItemId: itemId },
      data: { sourceInboxItemId: null },
    })
    await transaction.idea.updateMany({
      where: { sourceInboxItemId: itemId },
      data: { sourceInboxItemId: null },
    })
    await transaction.todo.updateMany({
      where: { sourceInboxItemId: itemId },
      data: { sourceInboxItemId: null },
    })
    await transaction.inboxExecution.deleteMany({ where: { inboxItemId: itemId } })
    await transaction.inboxEvent.deleteMany({ where: { inboxItemId: itemId } })
    await transaction.inboxItem.delete({ where: { id: itemId } })
  })
}
