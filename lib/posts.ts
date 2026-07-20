import { prisma } from "./db"

export async function getRecentPosts(take = 5) {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take,
    include: { category: true },
  })
}

export async function getAllPosts() {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })
}

export async function getPostBySlug(slug: string) {
  return prisma.post.findUnique({
    where: { slug },
    include: { category: true },
  })
}

export function calculateReadTime(content: string): number {
  // 中文按字数算，每分钟 300 字
  const text = content.replace(/<[^>]+>/g, "")
  const chars = text.length
  return Math.max(1, Math.ceil(chars / 300))
}

export function generateSlug(title: string): string {
  const ts = Date.now().toString(36)
  const clean = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "-").toLowerCase().slice(0, 30)
  return `${clean}-${ts}`
}
