import assert from "node:assert/strict"
import test from "node:test"
import { execFileSync } from "node:child_process"

const ideas = import("../lib/ideas-validation")

test("Idea 创建输入严格校验并去重标签和项目", async () => {
  const { ideaCreateSchema, parseIdeaInput } = await ideas
  const value = parseIdeaInput(ideaCreateSchema, {
    title: "  一个想法  ",
    content: "正文",
    tags: ["学习", "学习", "编程"],
    projectIds: ["project-1", "project-1"],
  })

  assert.equal(value.title, "一个想法")
  assert.deepEqual(value.tags, ["学习", "编程"])
  assert.deepEqual(value.projectIds, ["project-1"])
  assert.throws(() => parseIdeaInput(ideaCreateSchema, {
    title: "Idea",
    content: "正文",
    unknown: true,
  }), /不支持|Unrecognized|字段|Idea 数据无效/)

  assert.doesNotThrow(() => parseIdeaInput(ideaCreateSchema, {
    title: "😀".repeat(200),
    content: "😀".repeat(100_000),
    tags: [],
    projectIds: [],
  }))
  assert.throws(() => parseIdeaInput(ideaCreateSchema, {
    title: "Idea",
    content: "😀".repeat(100_001),
    tags: [],
    projectIds: [],
  }), /100000/)
})

test("Idea 更新必须包含受支持字段", async () => {
  const { ideaUpdateSchema, parseIdeaInput } = await ideas
  assert.throws(() => parseIdeaInput(ideaUpdateSchema, {}), /至少提供一个/)
  assert.throws(() => parseIdeaInput(ideaUpdateSchema, { sourceInboxItemId: "x" }))
})

test("Idea 转博客和 Todo 使用互斥的严格契约", async () => {
  const { ideaConversionSchema, parseIdeaInput } = await ideas

  const blog = parseIdeaInput(ideaConversionSchema, {
    targetType: "BLOG",
    requestKey: "request-1234",
    title: "博客标题",
    content: "博客正文",
    excerpt: null,
    tags: [],
  })
  assert.equal(blog.targetType, "BLOG")

  const todo = parseIdeaInput(ideaConversionSchema, {
    targetType: "TODO",
    requestKey: "request-5678",
    title: "任务标题",
    description: "任务描述",
    projectId: null,
    priority: null,
    dueDate: null,
    completionCriteria: null,
    subtasks: [{ title: "第一步" }],
  })
  assert.equal(todo.targetType, "TODO")
  assert.equal(todo.priority, null)

  assert.throws(() => parseIdeaInput(ideaConversionSchema, {
    ...todo,
    priority: 3,
  }))
  assert.throws(() => parseIdeaInput(ideaConversionSchema, {
    ...blog,
    publish: true,
  }))
})

test("Idea 查询拒绝未知或重复的筛选参数", async () => {
  const { parseIdeaSearchParams } = await ideas
  assert.deepEqual(
    parseIdeaSearchParams(new URLSearchParams("q=typescript&tag=学习&projectId=p1")),
    { q: "typescript", tag: "学习", projectId: "p1" }
  )
  assert.throws(() => parseIdeaSearchParams(new URLSearchParams("status=public")), /不支持/)
  assert.throws(() => parseIdeaSearchParams(new URLSearchParams("tag=a&tag=b")), /不能重复/)
})


test("Idea validation imports without database configuration outside the build phase", () => {
  const env = { ...process.env }
  delete env.DATABASE_URL
  delete env.NEXT_PHASE
  execFileSync(process.execPath, ["--import", "tsx", "--eval", `
    const { ideaCreateSchema, parseIdeaInput } = require("./lib/ideas-validation.ts")
    const value = parseIdeaInput(ideaCreateSchema, { title: " Idea ", content: " raw\\r\\n" })
    if (value.title !== "Idea" || value.content !== " raw\\r\\n") process.exit(1)
  `], { cwd: process.cwd(), env, stdio: "pipe" })
})

test("Idea validators retain raw content and conversion defaults", async () => {
  const { ideaCreateSchema, ideaConversionSchema, ideaUpdateSchema, parseIdeaInput } = await ideas
  const content = "  原文\r\n尾行  "
  assert.deepEqual(parseIdeaInput(ideaCreateSchema, { title: " Idea ", content }), {
    title: "Idea", content, tags: [], projectIds: [],
  })
  assert.deepEqual(parseIdeaInput(ideaUpdateSchema, { content }), { content })
  assert.deepEqual(parseIdeaInput(ideaConversionSchema, {
    targetType: "BLOG", requestKey: "request-1234", title: " 文章 ", content,
  }), { targetType: "BLOG", requestKey: "request-1234", title: "文章", content, excerpt: null, tags: [] })
  assert.deepEqual(parseIdeaInput(ideaConversionSchema, {
    targetType: "TODO", requestKey: "request-1234", title: " 任务 ", description: "  ",
  }), {
    targetType: "TODO", requestKey: "request-1234", title: "任务", description: null,
    projectId: null, priority: null, dueDate: null, completionCriteria: null, subtasks: [],
  })
})

test("material states and summary are editable but raw provenance is immutable", async () => {
  const { ideaUpdateSchema, parseIdeaInput, parseIdeaSearchParams } = await ideas
  for (const discussionStatus of ["STORED", "WANT_DISCUSS", "DISCUSSED", "ARCHIVED"]) {
    assert.deepEqual(parseIdeaInput(ideaUpdateSchema, { discussionStatus }), { discussionStatus })
  }
  assert.deepEqual(parseIdeaInput(ideaUpdateSchema, { discussionSummary: " summary " }), { discussionSummary: "summary" })
  for (const key of ["rawInput", "source", "capturedAt", "ownerId"])
    assert.throws(() => parseIdeaInput(ideaUpdateSchema, { [key]: "changed" }))
  assert.throws(() => parseIdeaInput(ideaUpdateSchema, { discussionStatus: "PUBLIC" }))
  assert.equal(parseIdeaSearchParams(new URLSearchParams("discussionStatus=WANT_DISCUSS")).discussionStatus, "WANT_DISCUSS")
  assert.throws(() => parseIdeaSearchParams(new URLSearchParams("discussionStatus=PUBLIC")))
})
