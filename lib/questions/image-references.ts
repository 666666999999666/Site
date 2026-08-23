import { Prisma } from "@/lib/generated/prisma/client"
import { ValidationError } from "@/lib/errors"
import { questionTable } from "./database"
import { extractQuestionImageIds } from "./markdown"

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

interface DesiredReference {
  imageId: string
  fieldType: "PROMPT" | "REFERENCE"
}

function desiredReferences(promptMarkdown: string, referenceAnswerMarkdown: string | null) {
  const references: DesiredReference[] = []
  for (const imageId of extractQuestionImageIds(promptMarkdown)) {
    references.push({ imageId, fieldType: "PROMPT" })
  }
  if (referenceAnswerMarkdown) {
    for (const imageId of extractQuestionImageIds(referenceAnswerMarkdown)) {
      references.push({ imageId, fieldType: "REFERENCE" })
    }
  }
  return references
}

export function validateQuestionMarkdownImages(
  promptMarkdown: string,
  referenceAnswerMarkdown: string | null
): DesiredReference[] {
  return desiredReferences(promptMarkdown, referenceAnswerMarkdown)
}

export async function syncQuestionImageReferences(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  questionId: string,
  desired: DesiredReference[],
  now: Date
): Promise<void> {
  const existing = await transaction.questionImageReference.findMany({
    where: { ownerId, questionId },
    select: { imageId: true, fieldType: true },
  })
  const imageIds = [...new Set([
    ...existing.map((reference) => reference.imageId),
    ...desired.map((reference) => reference.imageId),
  ])].sort()

  // Reject foreign or missing desired IDs before taking any resource lock, so
  // a guessed cross-owner ID cannot create lock contention for its real owner.
  const initiallyOwnedImages = imageIds.length === 0 ? [] : await transaction.questionImage.findMany({
    where: { id: { in: imageIds }, ownerId },
    select: { id: true },
  })
  const initiallyOwnedIds = new Set(initiallyOwnedImages.map((image) => image.id))
  if (desired.some((reference) => !initiallyOwnedIds.has(reference.imageId))) {
    throw new ValidationError("题目包含不存在的私有图片")
  }

  const ownedImageIds = imageIds.filter((id) => initiallyOwnedIds.has(id))
  if (ownedImageIds.length > 0) {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM ${questionTable("QuestionImage")}
        WHERE "ownerId" = ${ownerId}
          AND "id" IN (${Prisma.join(ownedImageIds)})
        ORDER BY "id" FOR UPDATE`
    )
  }

  const images = imageIds.length === 0 ? [] : await transaction.questionImage.findMany({
    where: { id: { in: imageIds }, ownerId },
    select: { id: true, unreferencedAt: true },
  })
  const byId = new Map(images.map((image) => [image.id, image]))
  const existingIds = new Set(existing.map((reference) => reference.imageId))
  const cutoff = new Date(now.getTime() - GRACE_PERIOD_MS)
  for (const reference of desired) {
    const image = byId.get(reference.imageId)
    if (!image) throw new ValidationError("题目包含不存在的私有图片")
    if (
      !existingIds.has(reference.imageId) &&
      image.unreferencedAt &&
      image.unreferencedAt <= cutoff
    ) {
      throw new ValidationError("题目包含已过期的暂存图片，请重新上传")
    }
  }

  await transaction.questionImageReference.deleteMany({ where: { ownerId, questionId } })
  if (desired.length > 0) {
    await transaction.questionImageReference.createMany({
      data: desired.map((reference) => ({ ownerId, questionId, ...reference })),
      skipDuplicates: true,
    })
  }

  for (const imageId of imageIds) {
    const count = await transaction.questionImageReference.count({ where: { imageId, ownerId } })
    if (count > 0) {
      await transaction.questionImage.update({
        where: { id: imageId },
        data: { unreferencedAt: null },
      })
    } else {
      await transaction.questionImage.updateMany({
        where: { id: imageId, ownerId, unreferencedAt: null },
        data: { unreferencedAt: now },
      })
    }
  }
}
