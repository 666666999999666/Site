import assert from "node:assert/strict"
import test from "node:test"
import { conciseSeriesDescription } from "../lib/series-description"

test("Home series previews keep only a concise first sentence without changing source text", () => {
  assert.equal(conciseSeriesDescription("  学习 Agent 的基础。\n\n后续是详细介绍。 "), "学习 Agent 的基础。")
  assert.equal(conciseSeriesDescription("第一句。第二句。"), "第一句。")
  assert.equal(conciseSeriesDescription("Python 后端学习记录"), "Python 后端学习记录")
  assert.equal(conciseSeriesDescription(" "), "")
  assert.equal(conciseSeriesDescription("😀".repeat(81)), "😀".repeat(80) + "…")
})
