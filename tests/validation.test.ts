import assert from "node:assert/strict"
import test from "node:test"
import {
  validatePasswordChange,
  validatePostCreate,
  validateProjectCreate,
  validateSettings,
  validateTodoCreate,
  validateTodoDraft,
  validateTodoSubtaskCreate,
  validateTodoSubtaskUpdate,
  validateEmptyObject,
  validateTodoUpdate,
} from "../lib/validation"

test("post validation trims fields and requires timezone-aware dates", () => {
  const post = validatePostCreate({
    title: "  标题  ",
    content: "正文",
    tags: [" TypeScript ", "TypeScript"],
    status: "PUBLISHED",
    publishedAt: "2026-07-29T10:00:00+08:00",
  })
  assert.equal(post.title, "标题")
  assert.deepEqual(post.tags, ["TypeScript"])
  assert.equal(post.publishedAt?.toISOString(), "2026-07-29T02:00:00.000Z")

  assert.throws(() => validatePostCreate({
    title: "标题",
    content: "",
    publishedAt: "2026-07-29T10:00",
  }), /必须包含时区/)
})

test("post validation accepts bounded draft metadata and upload covers", () => {
  const post = validatePostCreate({
    title: "草稿",
    content: "正文",
    coverImage: "/uploads/cover.webp",
    draftMetadata: { source: "mcp", nested: { reviewed: false } },
  })
  assert.equal(post.coverImage, "/uploads/cover.webp")
  assert.deepEqual(post.draftMetadata, { source: "mcp", nested: { reviewed: false } })
  assert.throws(() => validatePostCreate({
    title: "草稿",
    content: "",
    coverImage: "../cover.webp",
  }), /路径无效/)
  assert.throws(() => validatePostCreate({
    title: "草稿",
    content: "",
    draftMetadata: "not-an-object",
  }), /JSON 对象/)
})

test("bodyless mutation contracts reject smuggled fields", () => {
  assert.doesNotThrow(() => validateEmptyObject({}))
  assert.throws(() => validateEmptyObject({ sourceInboxItemId: "private" }), /不支持的字段/)
})

test("todo validation rejects invalid status and priority", () => {
  assert.throws(() => validateTodoUpdate({ status: "UNKNOWN" }), /状态无效/)
  assert.throws(() => validateTodoUpdate({ priority: 3 }), /0 到 2/)
  assert.deepEqual(validateTodoDraft({}), { markDone: false })
  assert.deepEqual(validateTodoDraft({ markDone: true }), { markDone: true })
  assert.throws(() => validateTodoDraft({ markDone: "yes" }), /必须是布尔值/)
  assert.throws(() => validateTodoDraft({ title: "unexpected" }), /不支持的字段/)
})

test("todo validation supports unset priority, projects, completion criteria and subtasks", () => {
  const todo = validateTodoCreate({
    title: "  完成收件箱  ",
    projectId: "project-1",
    priority: null,
    completionCriteria: "测试全部通过",
    subtasks: [
      { title: "  单元测试  ", completed: true, sortOrder: 2 },
      { title: "集成测试" },
    ],
  })

  assert.equal(todo.title, "完成收件箱")
  assert.equal(todo.projectId, "project-1")
  assert.equal(todo.priority, null)
  assert.equal(todo.completionCriteria, "测试全部通过")
  assert.deepEqual(todo.subtasks, [
    { title: "单元测试", completed: true, sortOrder: 2 },
    { title: "集成测试" },
  ])

  assert.deepEqual(validateTodoUpdate({ subtasks: [
    { id: "existing-subtask", title: "保留原子任务", completed: true },
  ] }).subtasks, [
    { id: "existing-subtask", title: "保留原子任务", completed: true },
  ])
  assert.throws(() => validateTodoCreate({
    title: "新 Todo",
    subtasks: [{ id: "client-id", title: "客户端指定 ID" }],
  }), /不支持的字段/)

  assert.throws(() => validateTodoUpdate({ subtasks: [
    { id: "duplicate", title: "一" },
    { id: "duplicate", title: "二" },
  ] }), /ID 不能重复/)
  assert.throws(() => validateTodoUpdate({ sourceInboxItemId: "private" }), /不支持的字段/)
})

test("todo subtask validation uses strict create and update fields", () => {
  assert.deepEqual(validateTodoSubtaskCreate({
    title: "  编写测试  ",
    completed: false,
    sortOrder: 1,
  }), {
    title: "编写测试",
    completed: false,
    sortOrder: 1,
  })
  assert.deepEqual(validateTodoSubtaskUpdate({ completed: true }), { completed: true })
  assert.throws(() => validateTodoSubtaskCreate({ id: "client-id", title: "任务" }), /不支持的字段/)
  assert.throws(() => validateTodoSubtaskUpdate({}), /没有可更新/)
  assert.throws(() => validateTodoSubtaskUpdate({ completed: "yes" }), /必须是布尔值/)
  assert.throws(() => validateTodoSubtaskUpdate({ sortOrder: -1 }), /0 到 10000/)
})

test("project validation only accepts web URLs and local cover paths", () => {
  assert.throws(() => validateProjectCreate({
    title: "项目",
    sourceUrl: "javascript:alert(1)",
  }), /只支持 http 或 https/)
  assert.throws(() => validateProjectCreate({
    title: "项目",
    coverImage: "../secret",
  }), /路径无效/)
})

test("settings use a strict allowlist", () => {
  assert.throws(() => validateSettings({ arbitrary: "value" }), /不支持的字段/)
})

test("new passwords require 15 to 128 characters", () => {
  assert.throws(() => validatePasswordChange({
    currentPassword: "current",
    newPassword: "too-short",
  }), /至少 15/)
  assert.equal(validatePasswordChange({
    currentPassword: "current",
    newPassword: "a secure password",
  }).newPassword, "a secure password")
})
