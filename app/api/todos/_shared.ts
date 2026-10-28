import type { Prisma } from "@/lib/generated/prisma/client"

export const todoInclude = {
  category: true,
  project: true,
  subtasks: {
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
  },
} satisfies Prisma.TodoInclude

export function todoIncludeForOwner(ownerId: string) {
  return {
    ...todoInclude,
    ideaConversions: {
      where: { ownerId },
      select: { idea: { select: { id: true, title: true } } },
    },
  } satisfies Prisma.TodoInclude
}
