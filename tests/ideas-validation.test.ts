import assert from "node:assert/strict"
import test from "node:test"

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test"

const ideas = import("../lib/ideas")

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
