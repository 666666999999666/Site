import assert from "node:assert/strict"
import test from "node:test"
import { ideaConversionDigest } from "../lib/idea-conversion-key"
test("conversion request digest ignores key order but not edited fields", () => {
  assert.equal(ideaConversionDigest({title:"t",subtasks:[{title:"a"}]}),ideaConversionDigest({subtasks:[{title:"a"}],title:"t"}))
  assert.notEqual(ideaConversionDigest({title:"t"}),ideaConversionDigest({title:"changed"}))
})
