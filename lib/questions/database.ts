import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { ReviewConflictError } from "./errors"

const SERIALIZABLE_ATTEMPTS = 3

function isSerializableConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

export async function runQuestionTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!isSerializableConflict(error)) throw error
      if (attempt === SERIALIZABLE_ATTEMPTS) throw new ReviewConflictError()
      await new Promise((resolve) => setTimeout(resolve, attempt * 10))
    }
  }
  throw new ReviewConflictError()
}

export async function lockQuestionOwner(
  transaction: Prisma.TransactionClient,
  ownerId: string
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM ${questionTable("User")} WHERE "id" = ${ownerId} FOR UPDATE`
  )
  if (rows.length !== 1) throw new ReviewConflictError("当前用户不存在")
}

export function questionTable(name: "User" | "QuestionImage") {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new ReviewConflictError("数据库连接未配置")
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public"
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(schema)) {
    throw new ReviewConflictError("数据库 schema 无效")
  }
  return Prisma.raw(`"${schema}"."${name}"`)
}
