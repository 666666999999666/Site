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

export const privateJsonHeaders = {
  "Cache-Control": "private, no-store",
} as const
