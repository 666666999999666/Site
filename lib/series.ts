import { prisma } from "./db"
import { ConflictError, NotFoundError, ValidationError } from "./errors"
import type { SeriesInput } from "./validation"
import { detachPostsAndDeleteSeries } from "./series-deletion"

function slugifySeriesTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 120)
}

async function ensureUniqueSeriesSlug(slug: string, excludeId?: string) {
  const duplicate = await prisma.series.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      slug: { equals: slug, mode: "insensitive" },
    },
    select: { id: true },
  })
  if (duplicate) throw new ConflictError("系列 slug 已存在")
}

export async function createSeries(
  input: SeriesInput & { title: string; description: string }
) {
  const slug = input.slug ?? slugifySeriesTitle(input.title)
  if (!slug) throw new ValidationError("系列标题无法生成有效 slug，请手动填写")
  await ensureUniqueSeriesSlug(slug)
  return prisma.series.create({
    data: {
      title: input.title,
      slug,
      description: input.description,
      coverImage: input.coverImage ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  })
}

export async function updateSeries(id: string, input: SeriesInput) {
  const current = await prisma.series.findUnique({ where: { id }, select: { id: true } })
  if (!current) throw new NotFoundError("系列不存在")
  if (input.slug) await ensureUniqueSeriesSlug(input.slug, id)
  return prisma.series.update({ where: { id }, data: input })
}

export async function deleteSeries(id: string) {
  const series = await prisma.series.findUnique({ where: { id }, select: { id: true } })
  if (!series) throw new NotFoundError("系列不存在")
  const detachedPosts = await prisma.$transaction(
    (transaction) => detachPostsAndDeleteSeries(transaction, id)
  )
  return { ok: true, detachedPosts }
}
