import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import { Prisma } from "../lib/generated/prisma/client"
import { requireBlogSeriesTestDatabaseUrl } from "./blog-series-test-database"

const execFileAsync = promisify(execFile)
const { url: connectionString } = requireBlogSeriesTestDatabaseUrl(
  process.env.BLOG_SERIES_TEST_DATABASE_URL
)

async function main() {
  process.env.DATABASE_URL = connectionString
  const prismaCli = path.resolve("node_modules/prisma/build/index.js")
  await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: connectionString },
  })

  const [{ prisma }, { createSeries, deleteSeries, updateSeries }] = await Promise.all([
    import("../lib/db"),
    import("../lib/series"),
  ])
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const postSlugs = [`blog-series-a-${suffix}`, `blog-series-b-${suffix}`]
  const duplicatePostSlug = `blog-series-duplicate-${suffix}`
  let seriesId: string | null = null

  try {
    const series = await createSeries({
      title: `Integration ${suffix}`,
      slug: `integration-${suffix}`,
      description: "disposable integration series",
      coverImage: null,
      sortOrder: 7,
    })
    seriesId = series.id
    const updated = await updateSeries(series.id, {
      description: "updated integration series",
      coverImage: "/uploads/integration.webp",
      sortOrder: 8,
    })
    assert.equal(updated.description, "updated integration series")
    assert.equal(updated.coverImage, "/uploads/integration.webp")
    assert.equal(updated.sortOrder, 8)

    const posts = await Promise.all(postSlugs.map((slug, index) => prisma.post.create({
      data: {
        title: `Integration post ${index}`,
        content: "integration only",
        slug,
        tags: ["integration"],
        seriesId: series.id,
        seriesOrder: index,
      },
    })))

    await assert.rejects(
      prisma.post.create({
        data: {
          title: "Duplicate integration post",
          content: "must conflict",
          slug: duplicatePostSlug,
          tags: [],
          seriesId: series.id,
          seriesOrder: 1,
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof Prisma.PrismaClientKnownRequestError)
        assert.equal(error.code, "P2002")
        return true
      }
    )

    const deletion = await deleteSeries(series.id)
    seriesId = null
    assert.deepEqual(deletion, { ok: true, detachedPosts: 2 })
    const retained = await prisma.post.findMany({
      where: { id: { in: posts.map((post) => post.id) } },
      orderBy: { slug: "asc" },
    })
    assert.equal(retained.length, 2)
    assert.ok(retained.every((post) => post.seriesId === null && post.seriesOrder === null))

    console.log("Blog Series integration test passed")
  } finally {
    await prisma.post.deleteMany({ where: { slug: { in: [...postSlugs, duplicatePostSlug] } } })
    if (seriesId) await prisma.series.deleteMany({ where: { id: seriesId } })
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
