import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

// 构建时没有 DATABASE_URL，延迟初始化
export const prisma = globalForPrisma.prisma ?? (process.env.DATABASE_URL ? createPrismaClient() : undefined as unknown as PrismaClient)

if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL) globalForPrisma.prisma = prisma
