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
  // 从 Tiptap JSON 递归提取纯文本，再按字数计算
  let text: string
  try {
    const json = JSON.parse(content)
    text = extractText(json)
  } catch {
    text = content.replace(/<[^>]+>/g, "")
  }
  const chars = text.length
  return Math.max(1, Math.ceil(chars / 300))
}

function extractText(node: Record<string, unknown>): string {
  let result = ""
  if (typeof node.text === "string") {
    result += node.text
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content as Record<string, unknown>[]) {
      result += extractText(child)
    }
  }
  return result
}

export function generateSlug(title: string): string {
  const ts = Date.now().toString(36)
  const clean = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "-").toLowerCase().slice(0, 30)
  return `${clean}-${ts}`
}
