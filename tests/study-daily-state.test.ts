import assert from "node:assert/strict"
import test from "node:test"
import type { DailyDayView, DailyTaskView } from "../lib/daily"
import { withTask, changeTaskTitle as changeTitle, selectTaskTodo as chooseTodo } from "../components/admin/daily-task-state"
import { revealReview as reveal, ratingRequest, reviewSnapshot, type CurrentReview } from "../components/questions/study-state"
const snapshot = (current: CurrentReview & { revealed: NonNullable<CurrentReview["revealed"]>; rating: NonNullable<CurrentReview["rating"]> }) => reviewSnapshot(current, current.revealed, current.rating)

const task = { id: "task-1", slot: 1 as const, title: "Original", completed: true, completedAt: "2026-10-20T00:00:00Z", sourceTodoId: "todo-1" }
const current = { question: { id: "q1", reviewKey: "review-1", promptMarkdown: "Prompt", contentVersion: 2, scheduleVersion: 3 }, answerMarkdown: "My answer", revealed: null, directReveal: false, rating: null, reviewRevision: null }

test("Daily title edits retain completion and source only for exact source title", () => {
  const source = { id: "todo-1", title: "Original" }
  assert.deepEqual(changeTitle(task, "Original", source), task)
  assert.deepEqual(changeTitle(task, "Changed", source), { ...task, title: "Changed", sourceTodoId: null })
  assert.deepEqual(changeTitle(task, "", source), { ...task, title: "", completed: false, completedAt: null, sourceTodoId: null })
  assert.deepEqual(changeTitle(task, " ", source), { ...task, title: " ", sourceTodoId: null })
  assert.equal(changeTitle(task, "Original", undefined).sourceTodoId, null)
  assert.equal(task.sourceTodoId, "todo-1")
})

test("Daily Todo selection always resets completion, including unknown selection", () => {
  assert.deepEqual(chooseTodo(task, { id: "todo-2", title: "Next" }), { ...task, title: "Next", sourceTodoId: "todo-2", completed: false, completedAt: null })
  assert.deepEqual(chooseTodo(task, undefined), { ...task, sourceTodoId: null, completed: false, completedAt: null })
})

test("Study reveal respects explicit server mode and nullish rating/revision fallbacks", () => {
  const response = { referenceAnswerMarkdown: "Reference", attempts: [] }
  assert.deepEqual(reveal(current, response), { ...current, revealed: response })
  const blank = { ...current, answerMarkdown: " \n " }
  assert.deepEqual(reveal(blank, response), { ...blank, revealed: response, directReveal: true, rating: "AGAIN" })
  assert.equal(reveal(blank, { ...response, directReveal: false, rating: "EASY", reviewRevision: 3 }).rating, null)
  assert.equal(reveal(current, { ...response, directReveal: true, rating: "HARD", reviewRevision: 0 }).reviewRevision, 0)
  assert.equal(reveal(current, { ...response, directReveal: true, rating: "HARD" }).rating, "HARD")
  assert.equal(current.revealed, null)
})

test("Study rating CREATE sends answer/version while REVISE sends only review revision", () => {
  assert.deepEqual(ratingRequest(current, "GOOD"), { operation: "CREATE", answerMarkdown: "My answer", rating: "GOOD", expectedContentVersion: 2, expectedScheduleVersion: 3 })
  for (const revision of [0, 1, 7]) {
    assert.deepEqual(ratingRequest({ ...current, reviewRevision: revision }, "EASY"), { operation: "REVISE", rating: "EASY", expectedReviewRevision: revision })
  }
})

test("Study completed history projects only display fields, retaining revealed snapshot", () => {
  const revealed = { referenceAnswerMarkdown: "Reference", attempts: [] }
  assert.deepEqual(snapshot({ ...current, revealed, rating: "GOOD", reviewRevision: 4 }), { key: "review-1", promptMarkdown: "Prompt", answerMarkdown: "My answer", revealed, directReveal: false, rating: "GOOD" })
})

test("Daily reconciliation replaces only matching slot and recalculates rounded progress", () => {
  const day: DailyDayView = { date: "2026-10-20", quote: { id: 1, quote: "Keep going", category: "Focus", author: null, source: null, sourceDetail: null }, tasks: [task, { ...task, slot: 2, completed: false }, { ...task, slot: 3, completed: false }], completedCount: 1, progress: 33 }
  for (const completed of [false, true]) {
    const next: DailyTaskView = { ...task, slot: 2, completed }
    const result = withTask(day, next)
    assert.equal(result.tasks[0], task)
    assert.equal(result.tasks[1], next)
    assert.equal(result.tasks[2], day.tasks[2])
    assert.equal(result.completedCount, completed ? 2 : 1)
    assert.equal(result.progress, completed ? 67 : 33)
    assert.equal(result.date, day.date)
    assert.equal(result.quote, day.quote)
  }
  assert.equal(day.tasks[1].completed, false)
})
