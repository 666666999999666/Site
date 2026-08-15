import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  InboxInputError,
  createInboxRawHash,
  mapInboxBlog,
  mapInboxIdea,
  mapInboxTodo,
  parseInboxInput,
} from "../lib/inbox"
import { validatePostUpdate, validateTodoUpdate } from "../lib/validation"

test("parseInboxInput recognizes the three prefixes without asking a model", () => {
  assert.deepEqual(parseInboxInput("idea：一个想法"), {
    kind: "IDEA",
    parsedBody: "一个想法",
    parserVersion: 1,
  })
  assert.equal(parseInboxInput("IDEA: upper case").kind, "IDEA")
  assert.equal(parseInboxInput("文章: 一篇文章").kind, "BLOG")
  assert.equal(parseInboxInput("TODO：完成测试").kind, "TODO")
})

test("parseInboxInput allows a BOM and leading whitespace", () => {
  const parsed = parseInboxInput("\uFEFF \n\t idea：\n  标题\n正文  ")
  assert.equal(parsed.kind, "IDEA")
  assert.equal(parsed.parsedBody, "标题\n正文")
})

test("parseInboxInput only treats the first prefix as routing data", () => {
  const parsed = parseInboxInput("todo：先处理收件箱\nidea：这一行仍是描述")
  assert.equal(parsed.kind, "TODO")
  assert.equal(parsed.parsedBody, "先处理收件箱\nidea：这一行仍是描述")
})

test("parseInboxInput rejects a missing prefix, empty body, and oversized raw input", () => {
  for (const rawInput of ["没有前缀", "idea：  \n\t", "学习：以后再做"]) {
    assert.throws(
      () => parseInboxInput(rawInput),
      (error) => error instanceof InboxInputError && error.code === "INVALID_PREFIX_OR_BODY"
    )
  }

  assert.throws(
    () => parseInboxInput(`idea：${"字".repeat(100_000)}`),
    (error) => error instanceof InboxInputError && error.code === "INPUT_TOO_LONG"
  )
  assert.equal(parseInboxInput(`idea：${"字".repeat(99_995)}`).kind, "IDEA")
})

test("the raw input hash is stable and hashes the unmodified input", () => {
  assert.equal(
    createInboxRawHash("idea：原文\r\n"),
    "39b14d2a84b882f976bda485c677af9beb6cebc8d39a0f25dd5ddcec4bd3dafb"
  )
  assert.notEqual(createInboxRawHash("idea：原文\r\n"), createInboxRawHash("idea：原文\n"))
})

test("blog mapping keeps the complete body and derives a Unicode-safe title", () => {
  const body = "  #   这是一个很长的文章标题😀后面还有一些文字用于超过三十个字符的限制测试\n\n正文不应丢失"
  const mapped = mapInboxBlog(body.trim())

  assert.equal(mapped.title, "这是一个很长的文章标题😀后面还有一些文字用于超过三十个字符的…")
  assert.equal(Array.from(mapped.title).length, 31)
  assert.equal(mapped.content, body.trim())
  assert.equal(mapped.status, "DRAFT")
  assert.equal(mapped.categoryId, null)
  assert.deepEqual(mapped.tags, [])
})

test("blog mapping does not normalize CRLF or TipTap-shaped copied text", () => {
  const body = '{"type":"doc","content":[]}\r\n第二行'
  assert.equal(mapInboxBlog(body).content, body)
})

test("the formal BLOG target persists parsedBody without content conversion", async () => {
  const previousNextPhase = process.env.NEXT_PHASE
  process.env.NEXT_PHASE = "phase-production-build"
  try {
    const { createFormalTarget } = await import("../lib/inbox/service")
    const body = '{"type":"doc","content":[]}\r\n第二行'
    let createdData: Record<string, unknown> | undefined
    const transaction = {
      post: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          createdData = args.data
          return { id: "post-1" }
        },
      },
    }

    const target = await createFormalTarget(transaction as never, {
      id: "inbox-1",
      ownerId: "user-1",
      kind: "BLOG",
      parsedBody: body,
    } as never)

    assert.deepEqual(target, { targetType: "BLOG", targetId: "post-1" })
    assert.equal(createdData?.content, body)
  } finally {
    if (previousNextPhase === undefined) delete process.env.NEXT_PHASE
    else process.env.NEXT_PHASE = previousNextPhase
  }
})

test("blog mapping gives a pure HTTP URL a deterministic bookmark title", () => {
  assert.equal(mapInboxBlog("https://example.com/path?q=1").title, "待整理：example.com")
  assert.equal(mapInboxBlog("http://localhost:3000/post").title, "待整理：localhost")
  assert.notEqual(mapInboxBlog("ftp://example.com/file").title, "待整理：example.com")
  assert.notEqual(mapInboxBlog("https://example.com\n附加说明").title, "待整理：example.com")

  const longHostname = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(50)}`
  const longUrlMapping = mapInboxBlog(`https://${longHostname}/reference`)
  assert.equal(Array.from(longUrlMapping.title).length, 200)
  assert.doesNotThrow(() => validatePostUpdate({ title: longUrlMapping.title }))
})

test("idea mapping preserves content and starts without inferred metadata", () => {
  const mapped = mapInboxIdea("## 构建一个真正的 Idea 收件箱\n后续再整理标签")
  assert.deepEqual(mapped, {
    title: "构建一个真正的 Idea 收件箱",
    content: "## 构建一个真正的 Idea 收件箱\n后续再整理标签",
    tags: [],
  })
})

test("todo mapping splits a normal first line from its description", () => {
  const mapped = mapInboxTodo("完成收件箱测试\n覆盖中文与 Emoji\n不猜测日期")
  assert.deepEqual(mapped, {
    title: "完成收件箱测试",
    description: "覆盖中文与 Emoji\n不猜测日期",
    status: "TODO",
    priority: null,
    dueDate: null,
    projectId: null,
    completionCriteria: null,
    subtasks: [],
  })
})

test("todo mapping preserves the complete body when its title is over 300 code points", () => {
  const firstLine = "😀".repeat(301)
  const body = `${firstLine}\n更多说明`
  const mapped = mapInboxTodo(body)

  assert.equal(Array.from(mapped.title).length, 300)
  assert.equal(mapped.description, body)
  assert.doesNotThrow(() => validateTodoUpdate({
    title: mapped.title,
    description: `${body}\n${"😀".repeat(90_000)}`,
  }))
})

test("todo mapping leaves a single-line description empty", () => {
  assert.equal(mapInboxTodo("只做这一件事").description, null)
})

test("the migration protects raw input, idempotency, and nullable Todo priority", () => {
  const migration = readFileSync(
    "prisma/migrations/20260815010000_prefix_inbox/migration.sql",
    "utf8"
  )

  assert.match(migration, /ALTER COLUMN "priority" DROP NOT NULL/)
  assert.match(migration, /"priority" IS NULL OR "priority" BETWEEN 0 AND 2/)
  assert.match(migration, /InboxItem_ownerId_requestKey_key/)
  assert.match(migration, /InboxExecution_pkey/)
  assert.match(migration, /CREATE TRIGGER "InboxItem_raw_immutable"/)
  assert.match(migration, /UPDATE OF "rawInput", "rawSha256"/)
})
