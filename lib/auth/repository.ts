import { prisma } from "@/lib/db"
import type { User } from "@/lib/generated/prisma/client"

export async function findUserByUsername(username: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { username } })
}
