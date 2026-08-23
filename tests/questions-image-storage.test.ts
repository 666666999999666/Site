import assert from "node:assert/strict"
import test from "node:test"
import { questionImagePath } from "../lib/questions/image-storage"
import { readQuestionImageUpload } from "../lib/questions/image-upload"

test("question image path rejects traversal and unexpected names", () => {
  assert.throws(() => questionImagePath("../secret.png"), /存储键无效/)
  assert.throws(() => questionImagePath("plain.png"), /存储键无效/)
  assert.match(
    questionImagePath("123e4567-e89b-12d3-a456-426614174000.webp"),
    /study-uploads[\\/]123e4567-e89b-12d3-a456-426614174000\.webp$/
  )
})

test("question image upload maps malformed multipart bodies to validation errors", async () => {
  const malformed = new Request("http://example.test/api/questions/images", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=missing" },
    body: "not multipart",
  })
  await assert.rejects(readQuestionImageUpload(malformed), /multipart 请求体无效/)
})
