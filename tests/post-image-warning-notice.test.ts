import assert from "node:assert/strict"
import test from "node:test"
import { consumePostImageWarnings, rememberPostImageWarnings } from "../lib/post-image-warning-notice"

function storage() {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
}

test("newly saved post warnings survive route replacement and are consumed exactly once", () => {
  const target = storage()
  const warnings = ["原图已保留，响应式图片生成失败；当前使用原图。"]
  assert.equal(rememberPostImageWarnings("new-post-id", warnings, "owner", target), true)
  // The destination has a fresh component state and only the returned post id.
  assert.deepEqual(consumePostImageWarnings("new-post-id", "owner", target), warnings)
  assert.deepEqual(consumePostImageWarnings("new-post-id", "owner", target), [])
  assert.equal(target.entries.size, 0)
})

test("notices stay isolated by saved post id and account", () => {
  const target = storage()
  rememberPostImageWarnings("one", ["图片处理繁忙，使用原图。"], "alice", target)
  assert.deepEqual(consumePostImageWarnings("two", "alice", target), [])
  assert.deepEqual(consumePostImageWarnings("one", "bob", target), [])
  assert.deepEqual(consumePostImageWarnings("one", "alice", target), ["图片处理繁忙，使用原图。"])
})

test("invalid and duplicate session entries do not become product notices", () => {
  const target = storage()
  rememberPostImageWarnings("one", ["警告", "警告", ""], undefined, target)
  assert.deepEqual(consumePostImageWarnings("one", undefined, target), ["警告"])
  target.setItem("qz-post-image-notice:local:one", "not json")
  assert.deepEqual(consumePostImageWarnings("one", undefined, target), [])
  assert.equal(target.entries.size, 0)
})

test("storage failure is reported to the caller for an immediate visible fallback", () => {
  const target = {
    getItem: () => { throw new Error("blocked") },
    setItem: () => { throw new Error("blocked") },
    removeItem: () => { throw new Error("blocked") },
  }
  assert.equal(rememberPostImageWarnings("one", ["原图已保留。"], "owner", target), false)
  assert.deepEqual(consumePostImageWarnings("one", "owner", target), [])
})
