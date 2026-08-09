import { prisma } from "@/lib/db"
import type { User } from "@/lib/generated/prisma/client"

export async function findFirstUser(): Promise<User | null> {
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
}
