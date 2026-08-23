import assert from "node:assert/strict"
import test from "node:test"
import { getShanghaiDayWindow } from "../lib/questions/date"

test("Shanghai review day uses +08:00 boundaries", () => {
  const beforeMidnight = getShanghaiDayWindow(new Date("2026-08-22T15:59:59.000Z"))
  assert.equal(beforeMidnight.dateKey, "2026-08-22")
  assert.equal(beforeMidnight.start.toISOString(), "2026-08-21T16:00:00.000Z")
  assert.equal(beforeMidnight.end.toISOString(), "2026-08-22T16:00:00.000Z")

  const afterMidnight = getShanghaiDayWindow(new Date("2026-08-22T16:00:00.000Z"))
  assert.equal(afterMidnight.dateKey, "2026-08-23")
  assert.equal(afterMidnight.reviewDate.toISOString(), "2026-08-23T00:00:00.000Z")
})
