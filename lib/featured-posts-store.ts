import { prisma } from "./db"
import {
  FEATURED_POSTS_SETTING_KEY,
  assertPublishedFeaturedPosts,
  orderPublishedFeaturedPosts,
  parseFeaturedPostIds,
  type FeaturedPost,
  type FeaturedPostsAdminState,
} from "./featured-posts"

async function readFeaturedIds() {
  const setting = await prisma.setting.findUnique({ where: { key: FEATURED_POSTS_SETTING_KEY } })
  return parseFeaturedPostIds(setting?.value)
}

export async function getFeaturedPosts(): Promise<FeaturedPost[]> {
  const ids = await readFeaturedIds()
  if (!ids.length) return []
  const posts = await prisma.post.findMany({
    where: { id: { in: ids }, status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, excerpt: true, status: true },
  })
  return orderPublishedFeaturedPosts(ids, posts).map(({ id, title, slug, excerpt }) => ({ id, title, slug, excerpt }))
}

export async function getFeaturedPostsAdminState(query = ""): Promise<FeaturedPostsAdminState> {
  const ids = await readFeaturedIds()
  const [selected, candidates] = await Promise.all([
    ids.length ? prisma.post.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, status: true },
    }) : [],
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        ...(query ? { title: { contains: query, mode: "insensitive" as const } } : {}),
      },
      select: { id: true, title: true, status: true },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 30,
    }),
  ])
  const byId = new Map(selected.map((post) => [post.id, post]))
  return {
    selected: ids.map((id) => byId.get(id) ?? { id, title: "文章已删除", status: "MISSING" as const }),
    candidates,
  }
}

export async function saveFeaturedPosts(ids: string[]) {
  await prisma.$transaction(async (database) => {
    const posts = ids.length ? await database.post.findMany({
      where: { id: { in: ids }, status: "PUBLISHED" },
      select: { id: true, title: true, status: true },
    }) : []
    assertPublishedFeaturedPosts(ids, posts)
    const value = JSON.stringify(ids)
    await database.setting.upsert({
      where: { key: FEATURED_POSTS_SETTING_KEY },
      create: { key: FEATURED_POSTS_SETTING_KEY, value },
      update: { value },
    })
  })
}
