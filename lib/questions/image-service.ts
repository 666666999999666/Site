import { prisma } from "@/lib/db"
import { NotFoundError } from "@/lib/errors"
import {
  readQuestionImage,
  removeQuestionImageFile,
  storeQuestionImage,
} from "./image-storage"
import { questionImageUrl } from "./markdown"

const UNREFERENCED_GRACE_MS = 24 * 60 * 60 * 1000

export async function createQuestionImage(ownerId: string, file: File) {
  const stored = await storeQuestionImage(file)
  try {
    const image = await prisma.questionImage.create({
      data: {
        ownerId,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        unreferencedAt: new Date(),
      },
      select: { id: true },
    })
    return { id: image.id, url: questionImageUrl(image.id) }
  } catch (error) {
    await removeQuestionImageFile(stored.storageKey).catch(() => undefined)
    throw error
  }
}
export async function getReadableQuestionImage(ownerId: string, id: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - UNREFERENCED_GRACE_MS)
  const image = await prisma.questionImage.findFirst({
    where: {
      id,
      ownerId,
      OR: [
        { references: { some: {} } },
        { unreferencedAt: { gt: cutoff } },
      ],
    },
    select: {
      storageKey: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
    },
  })
  if (!image) throw new NotFoundError("图片不存在")

  let body: Buffer
  try {
    body = await readQuestionImage(image.storageKey)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError("图片不存在")
    }
    throw error
  }
  if (body.length !== image.byteSize) {
    throw new NotFoundError("图片不存在")
  }
  return { ...image, body }
}
