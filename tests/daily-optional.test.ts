import assert from "node:assert/strict"
import test from "node:test"
import { dailyProgress } from "../lib/daily-policy"
import { isInactiveTodo } from "../lib/todos-policy"
import { validateTodoCreate, validateTodoUpdate } from "../lib/validation"

test("today can contain zero to three actual selections, not a three-item quota", () => {
  assert.deepEqual(dailyProgress([]), { selectedCount: 0, completedCount: 0, progress: 0 })
  assert.equal(dailyProgress([{ title: "", completed: false }]).progress, 0)
  assert.deepEqual(dailyProgress([{ title: "One", completed: true }, { title: "", completed: false }]), { selectedCount: 1, completedCount: 1, progress: 100 })
  assert.equal(dailyProgress([{ title: "One", completed: true }, { title: "Two", completed: false }]).progress, 50)
})

test("paused and cancelled linked tasks never count as selected or complete", () => {
  for (const status of ["PAUSED", "CANCELLED"]) {
    assert.equal(isInactiveTodo(status), true)
    assert.deepEqual(dailyProgress([{ title: "Old selection", completedAt: new Date(), sourceTodo: { status } }]), { selectedCount: 0, completedCount: 0, progress: 0 })
  }
  assert.deepEqual(dailyProgress([{ title: "Not active", completed: true, inactive: true }]), { selectedCount: 0, completedCount: 0, progress: 0 })
  assert.equal(isInactiveTodo("TODO"), false)
  assert.equal(isInactiveTodo("DONE"), false)
})

test("Todo status reasons are optional, bounded, and do not imply completion", () => {
  assert.deepEqual(validateTodoUpdate({ status: "PAUSED" }), { status: "PAUSED" })
  assert.deepEqual(validateTodoCreate({ title: "Keep", status: "CANCELLED", statusReason: "  No longer relevant  " }), { title: "Keep", status: "CANCELLED", statusReason: "No longer relevant" })
  assert.deepEqual(validateTodoUpdate({ status: "TODO", statusReason: null }), { status: "TODO", statusReason: null })
  assert.throws(() => validateTodoUpdate({ statusReason: "a".repeat(1001) }), /1000/)
})
