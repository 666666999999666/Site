import assert from "node:assert/strict"
import test from "node:test"
import {
  validatePasswordChange,
  validatePostCreate,
  validateProjectCreate,
  validateSettings,
  validateTodoDraft,
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

test("todo validation rejects invalid status and priority", () => {
  assert.throws(() => validateTodoUpdate({ status: "UNKNOWN" }), /状态无效/)
  assert.throws(() => validateTodoUpdate({ priority: 3 }), /0 到 2/)
  assert.deepEqual(validateTodoDraft({}), { markDone: false })
  assert.deepEqual(validateTodoDraft({ markDone: true }), { markDone: true })
  assert.throws(() => validateTodoDraft({ markDone: "yes" }), /必须是布尔值/)
  assert.throws(() => validateTodoDraft({ title: "unexpected" }), /不支持的字段/)
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
