import { prisma } from "./db"
import { ConflictError, ValidationError } from "./errors"
import type { Prisma } from "./generated/prisma/client"
import type { CategoryInput } from "./validation"

export type CategoryCreateInput = CategoryInput & {
  name: string
  type: "BLOG" | "TODO"
}

type CategoryDatabase = typeof prisma | Prisma.TransactionClient

export async function createCategory(
  input: CategoryCreateInput,
  database: CategoryDatabase = prisma
) {
  const duplicate = await database.category.findFirst({
    where: {
      type: input.type,
      name: { equals: input.name, mode: "insensitive" },
    },
    select: { id: true },
  })
  if (duplicate) throw new ConflictError("同类型下已存在同名分区")

  return database.category.create({ data: input })
}

export async function resolveBlogCategory(reference: string | null | undefined) {
  if (!reference) return null
  const category = await prisma.category.findFirst({
    where: {
      type: "BLOG",
      OR: [
        { id: reference },
        { name: { equals: reference, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  })
  if (!category) throw new ValidationError(`博客分区不存在：${reference}`)
  return category.id
}
