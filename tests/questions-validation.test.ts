import assert from "node:assert/strict"
import test from "node:test"
import {
  parseQuestionInput,
  questionCreateSchema,
  questionPatchSchema,
  ratingRequestSchema,
} from "../lib/questions/validation"
import { assertAnswerHasNoImages, extractQuestionImageIds } from "../lib/questions/markdown"
import { escapeMarkdownImageAlt } from "../lib/questions/editor-markdown"

test("question create trims prompt and maps blank reference answer to null", () => {
  assert.deepEqual(parseQuestionInput(questionCreateSchema, {
    promptMarkdown: "  什么是 ContextVar？  ",
    referenceAnswerMarkdown: "  ",
  }), {
    promptMarkdown: "什么是 ContextVar？",
    referenceAnswerMarkdown: null,
  })
})

test("question create preserves non-blank reference answer markdown", () => {
  assert.deepEqual(parseQuestionInput(questionCreateSchema, {
    promptMarkdown: "问题",
    referenceAnswerMarkdown: "  answer\n  ",
  }), {
    promptMarkdown: "问题",
    referenceAnswerMarkdown: "  answer\n  ",
  })
})

test("question patch rejects unknown fields", () => {
  assert.throws(() => parseQuestionInput(questionPatchSchema, {
    operation: "SET_ENABLED",
    enabled: true,
    hidden: true,
  }), /不支持|Unrecognized|unrecognized/i)
})

test("question content edits require optimistic concurrency versions", () => {
  assert.throws(() => parseQuestionInput(questionPatchSchema, {
    operation: "EDIT_CONTENT",
    promptMarkdown: "并发编辑",
    referenceAnswerMarkdown: "答案",
    schedulePolicy: "KEEP",
  }), /版本|required|Required/i)

  const parsed = parseQuestionInput(questionPatchSchema, {
    operation: "EDIT_CONTENT",
    promptMarkdown: "并发编辑",
    referenceAnswerMarkdown: "答案",
    schedulePolicy: "KEEP",
    expectedContentVersion: 2,
    expectedScheduleVersion: 3,
  })
  assert.equal(parsed.operation, "EDIT_CONTENT")
})

test("rating create preserves exact answer body", () => {
  const result = parseQuestionInput(ratingRequestSchema, {
    operation: "CREATE",
    answerMarkdown: "  line one\nline two  ",
    rating: "GOOD",
    expectedContentVersion: 1,
    expectedScheduleVersion: 2,
  })
  assert.equal(result.operation, "CREATE")
  if (result.operation === "CREATE") {
    assert.equal(result.answerMarkdown, "  line one\nline two  ")
  }
})

test("question images only accept private API URLs and deduplicate IDs", () => {
  assert.deepEqual(
    extractQuestionImageIds("![a](/api/questions/images/img_1)\n![b](/api/questions/images/img_1)"),
    ["img_1"]
  )
  assert.throws(() => extractQuestionImageIds("![x](https://example.com/x.png)"), /私有上传地址/)
})

test("uploaded image filenames are escaped before becoming Markdown alt text", () => {
  assert.equal(escapeMarkdownImageAlt(String.raw`diagram\].png`), String.raw`diagram\\\].png`)
})

test("answers reject direct and reference-style images", () => {
  assert.throws(() => assertAnswerHasNoImages("![x](/api/questions/images/img_1)"), /不支持图片/)
  assert.throws(() => assertAnswerHasNoImages("![x][img]\n\n[img]: /api/questions/images/img_1"), /不支持图片/)
})
