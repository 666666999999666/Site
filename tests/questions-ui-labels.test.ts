import assert from "node:assert/strict"
import test from "node:test"
import { questionQueueMessage, questionRatings, ratingLabels, type TodayResponse } from "../components/questions/types"

function today(overrides: Partial<TodayResponse> = {}, summary: Partial<TodayResponse["summary"]> = {}): TodayResponse {
  return {
    state: "READY",
    preferences: { dailyNewLimit: 10 },
    ...overrides,
    summary: {
      dueOldCount: 0, newIntroducedToday: 0, newRemaining: 0,
      totalActions: 0, uniqueQuestions: 0, typedCount: 0, directRevealCount: 0,
      ratings: { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 },
      ...summary,
    },
  }
}

test("queue labels retain loading, due-old priority, new quota, waiting and completion", () => {
  assert.equal(questionQueueMessage(null), "正在读取今日队列")
  for (const state of ["READY", "WAITING", "DONE"] as const) {
    assert.equal(questionQueueMessage(today({ state }, { dueOldCount: 2, newRemaining: 5 })), "到期旧题 2 道")
  }
  assert.equal(questionQueueMessage(today({}, { newRemaining: 3 })), "可学习新题 · 剩余额度 3")
  assert.equal(questionQueueMessage(today({ state: "WAITING", nextDueAt: "2026-10-20T23:30:00Z" }, { newRemaining: 3 })), "暂时完成 · 07:30 后还有复习")
  for (const nextDueAt of [undefined, "not-a-date"]) {
    assert.equal(questionQueueMessage(today({ state: "WAITING", nextDueAt })), "暂时完成 · — 后还有复习")
  }
  assert.equal(questionQueueMessage(today()), "今日已完成")
  assert.equal(questionQueueMessage(today({ state: "DONE" }, { newRemaining: 3 })), "今日已完成")
})

test("question rating choices preserve the existing order and labels", () => {
  assert.deepEqual(questionRatings.map((rating) => [rating, ratingLabels[rating]]), [
    ["AGAIN", "重来"], ["HARD", "困难"], ["GOOD", "良好"], ["EASY", "简单"],
  ])
})
