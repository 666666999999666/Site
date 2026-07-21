import { prisma } from "./db"

export async function getAllProjects() {
  return prisma.project.findMany({
    orderBy: { sortOrder: "asc" },
  })
}

export async function getRecentProjects(limit = 4) {
  return prisma.project.findMany({
    orderBy: { sortOrder: "asc" },
    take: limit,
  })
}
