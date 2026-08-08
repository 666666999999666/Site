import { prisma } from "./db"
import { extractPlainText, normalizeContent } from "./content"
import { NotFoundError, ValidationError } from "./errors"
import { resolvePublishedAt } from "./post-policy"
import type { PostInput } from "./validation"
import { Prisma } from "./generated/prisma/client"

export interface PostSearchInput {
  title?: string
  keyword?: string
  tag?: string
  category?: string
  status?: "DRAFT" | "PUBLISHED" | "ALL"
  take?: number
}

export type PostCreateInput = Required<Pick<PostInput, "title" | "content">> & PostInput
export type DraftMetadataUpdateInput = Pick<
  PostInput,
  "title" | "excerpt" | "categoryId" | "tags" | "coverImage" | "draftMetadata"
>

type PostDatabase = typeof prisma | Prisma.TransactionClient

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

export async function searchPosts(input: PostSearchInput = {}) {
  const and: Prisma.PostWhereInput[] = []
  if (input.status && input.status !== "ALL") and.push({ status: input.status })
  if (input.title) {
    and.push({ title: { contains: input.title, mode: "insensitive" } })
  }
  if (input.keyword) {
    and.push({
      OR: [
        { title: { contains: input.keyword, mode: "insensitive" } },
        { content: { contains: input.keyword, mode: "insensitive" } },
        { excerpt: { contains: input.keyword, mode: "insensitive" } },
      ],
    })
  }
  if (input.tag) and.push({ tags: { has: input.tag } })
  if (input.category) {
    and.push({
      OR: [
        { categoryId: input.category },
        { category: { name: { equals: input.category, mode: "insensitive" } } },
      ],
    })
  }

  return prisma.post.findMany({
    where: and.length > 0 ? { AND: and } : undefined,
    orderBy: { createdAt: "desc" },
    take: input.take === undefined ? undefined : Math.min(Math.max(input.take, 1), 100),
    include: { category: true },
  })
}

async function ensureBlogCategory(
  categoryId: string | null | undefined,
  database: PostDatabase = prisma
) {
  if (!categoryId) return
  const category = await database.category.findUnique({
    where: { id: categoryId },
    select: { type: true },
  })
  if (!category || category.type !== "BLOG") {
    throw new ValidationError("文章分区不存在或不是博客分区")
  }
}

function jsonDatabaseValue(value: PostInput["draftMetadata"]) {
  if (value === undefined) return undefined
  return value === null ? Prisma.DbNull : value as Prisma.InputJsonValue
}

export async function createPost(input: PostCreateInput, database: PostDatabase = prisma) {
  await ensureBlogCategory(input.categoryId, database)
  const status = input.status ?? "DRAFT"
  const content = normalizeContent(input.content)

  return database.post.create({
    data: {
      title: input.title,
      content,
      excerpt: input.excerpt ?? null,
      slug: await generateUniqueSlug(input.title, database),
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      coverImage: input.coverImage ?? null,
      ...(input.draftMetadata !== undefined
        ? { draftMetadata: jsonDatabaseValue(input.draftMetadata) }
        : {}),
      status,
      readTime: calculateReadTime(content),
      publishedAt: resolvePublishedAt({
        nextStatus: status,
        requestedPublishedAt: input.publishedAt,
      }),
    },
  })
}

export async function updatePost(id: string, input: PostInput) {
  const current = await prisma.post.findUnique({ where: { id } })
  if (!current) throw new NotFoundError("文章不存在")
  await ensureBlogCategory(input.categoryId)
  const nextStatus = input.status ?? current.status
  const data: Prisma.PostUncheckedUpdateInput = {}

  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) {
    const content = normalizeContent(input.content)
    data.content = content
    data.readTime = calculateReadTime(content)
  }
  if (input.excerpt !== undefined) data.excerpt = input.excerpt
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.tags !== undefined) data.tags = input.tags
  if (input.coverImage !== undefined) data.coverImage = input.coverImage
  if (input.draftMetadata !== undefined) {
    data.draftMetadata = jsonDatabaseValue(input.draftMetadata)
  }
  if (input.status !== undefined) data.status = input.status
  if (input.status !== undefined || input.publishedAt !== undefined) {
    data.publishedAt = resolvePublishedAt({
      existing: {
        status: current.status,
        publishedAt: current.publishedAt,
      },
      nextStatus,
      requestedPublishedAt: input.publishedAt,
    })
  }

  return prisma.post.update({ where: { id }, data })
}

export async function updateDraftMetadata(
  id: string,
  input: DraftMetadataUpdateInput,
  database: PostDatabase = prisma
) {
  await ensureBlogCategory(input.categoryId, database)
  const data: Prisma.PostUncheckedUpdateManyInput = {}
  if (input.title !== undefined) data.title = input.title
  if (input.excerpt !== undefined) data.excerpt = input.excerpt
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.tags !== undefined) data.tags = input.tags
  if (input.coverImage !== undefined) data.coverImage = input.coverImage
  if (input.draftMetadata !== undefined) {
    data.draftMetadata = jsonDatabaseValue(input.draftMetadata)
  }

  const updated = await database.post.updateMany({
    where: { id, status: "DRAFT" },
    data,
  })
  if (updated.count !== 1) {
    const exists = await database.post.findUnique({ where: { id }, select: { status: true } })
    if (!exists) throw new NotFoundError("文章不存在")
    throw new ValidationError("MCP 只能修改草稿 metadata")
  }
  return database.post.findUniqueOrThrow({ where: { id } })
}

export async function assertDraftMetadataTarget(id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  })
  if (!post) throw new NotFoundError("文章不存在")
  if (post.status !== "DRAFT") throw new ValidationError("MCP 只能修改草稿 metadata")
  return post
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

export async function generateUniqueSlug(
  title: string,
  database: PostDatabase = prisma
): Promise<string> {
  const base = slugifyPostTitle(title) || `post-${Date.now().toString(36)}`
  let candidate = base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const exists = await database.post.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
    candidate = `${base}-${suffix}`
  }

  return `${base}-${Date.now().toString(36)}`
}
