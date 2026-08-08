import { prisma } from "@/lib/db"
import type { User } from "@/lib/generated/prisma/client"

export async function findUserByUsername(username: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { username } })
}

export async function findFirstUser(): Promise<User | null> {
  return prisma.user.findFirst()
}

export function findUserSessionState(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { passwordVersion: true },
  })
}
