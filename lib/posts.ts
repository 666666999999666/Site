import { prisma } from "./db"
import { extractPlainText } from "./content"

export async function getRecentPosts(take = 5) {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: { category: true },
  })
}

export async function getAllPosts() {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
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
  const text = extractPlainText(content)
  const chars = text.length
  return Math.max(1, Math.ceil(chars / 300))
}

export function slugifyPostTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 120)
}

export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugifyPostTitle(title) || `post-${Date.now().toString(36)}`
  let candidate = base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const exists = await prisma.post.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
    candidate = `${base}-${suffix}`
  }

  return `${base}-${Date.now().toString(36)}`
}
