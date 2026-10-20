import assert from "node:assert/strict"
import test from "node:test"
import { scanPublicationContent } from "../lib/publication-content"

// Import the post service with its documented build-safe database proxy. Every operation
// below uses an explicit in-memory fake; no database URL, connection or mutation is needed.
process.env.NEXT_PHASE = "phase-production-build"

test("post creation asks for review before any write and permits an explicitly reviewed literal", async () => {
  const { createPost } = await import("../lib/posts")
  const writes: Record<string, unknown>[] = []
  const database = { post: {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return data },
  } } as unknown as Parameters<typeof createPost>[1]
  const input = { title: "有意保留空白", content: "```js\nconst literal = 'a\u00a0b';\n```", status: "PUBLISHED" as const }
  await assert.rejects(createPost(input, database), /发布前请检查.*第 2 行/)
  assert.equal(writes.length, 0)
  const publicationReviewToken = scanPublicationContent(input).reviewToken
  await createPost({ ...input, publicationReviewToken, contentFormat: "STUDY_NOTE", readHint: "约 5 分钟" }, database)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].content, input.content)
  assert.equal(writes[0].contentFormat, "STUDY_NOTE")
  assert.equal(writes[0].readHint, "约 5 分钟")
  assert.equal(Object.hasOwn(writes[0], "publicationReviewToken"), false)
  await assert.rejects(createPost({ ...input, content: input.content + "\n更新正文", publicationReviewToken }, database), /发布前请检查/)
  assert.equal(writes.length, 1)
})

test("saving a draft with flagged content does not require publication acknowledgment", async () => {
  const { createPost } = await import("../lib/posts")
  const writes: Record<string, unknown>[] = []
  const database = { post: {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return data },
  } } as unknown as Parameters<typeof createPost>[1]
  await createPost({ title: "待补摘要", content: "![1.00](one.png)", status: "DRAFT" }, database)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].status, "DRAFT")
  assert.equal(writes[0].publishedAt, null)
})


test("published metadata updates stay writable while changed public text requires fresh review", async () => {
  const { updatePost } = await import("../lib/posts")
  const current = { id: "synthetic-post", title: "数字图解", content: "![1.00](one.png)", excerpt: null,
    status: "PUBLISHED", seriesId: null, publishedAt: new Date("2026-10-01T00:00:00Z") }
  const writes: Record<string, unknown>[] = []
  const database = { post: {
    findUnique: async () => current,
    update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...current, ...data } },
  } } as unknown as Parameters<typeof updatePost>[2]
  await updatePost(current.id, { readHint: "6 张图解", contentFormat: "DIAGRAM", tags: ["图解"] }, database)
  assert.equal(writes.length, 1)
  assert.equal(Object.hasOwn(writes[0], "content"), false)
  await assert.rejects(updatePost(current.id, { title: "新的图解标题" }, database), /发布前请检查/)
  assert.equal(writes.length, 1)
  await updatePost(current.id, {
    title: "新的图解标题", publicationReviewToken: scanPublicationContent({ ...current, title: "新的图解标题" }).reviewToken,
  }, database)
  assert.equal(writes.length, 2)
  assert.equal(writes[1].title, "新的图解标题")
  assert.equal(Object.hasOwn(writes[1], "publicationReviewToken"), false)
  await updatePost(current.id, { status: "DRAFT" }, database)
  assert.equal(writes[2].status, "DRAFT")
  assert.equal(writes[2].publishedAt, null)
})
