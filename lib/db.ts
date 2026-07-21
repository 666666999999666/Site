import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' ||
  (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('://'))

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

// 构建时返回一个所有查询都返回空数组的安全 client
function createBuildSafeClient(): PrismaClient {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === '$transaction') {
        return (fn: (client: PrismaClient) => Promise<unknown>) => fn(buildSafeClient as unknown as PrismaClient)
      }
      if (typeof prop === 'string') {
        return new Proxy({} as object, {
          get(_t, method) {
            if (method === 'findMany') return async () => []
            if (method === 'findFirst') return async () => null
            if (method === 'findUnique') return async () => null
            if (method === 'count') return async () => 0
            if (method === 'aggregate') return async () => ({})
            if (method === 'create') return async () => ({})
            if (method === 'update') return async () => ({})
            if (method === 'delete') return async () => ({})
            if (method === 'deleteMany') return async () => ({ count: 0 })
            if (method === 'updateMany') return async () => ({ count: 0 })
            return async () => []
          },
        })
      }
      return undefined
    },
  }

  return new Proxy({} as object, handler) as unknown as PrismaClient
}

const buildSafeClient = isBuildTime ? createBuildSafeClient() : null

export const prisma: PrismaClient = globalForPrisma.prisma ??
  (isBuildTime ? buildSafeClient! : createPrismaClient())

if (process.env.NODE_ENV !== 'production' && !isBuildTime) {
  globalForPrisma.prisma = prisma
}
