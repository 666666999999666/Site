import assert from "node:assert/strict"
import test from "node:test"
import { imageUploadWarning } from "../lib/image-upload-response"

test("an original upload retained after variant failure has an explicit non-blocking warning", () => {
  assert.match(imageUploadWarning({ processing: { status: "failed" } }) ?? "", /原图已上传.*生成失败/)
  assert.equal(imageUploadWarning({ processing: { status: "failed", warning: "原图已保留，派生失败" } }), "原图已保留，派生失败")
})

test("busy fallback remains visible while ordinary and legacy upload responses stay compatible", () => {
  assert.equal(imageUploadWarning({ processing: { status: "original-only", reason: "busy", warning: "原图已上传，图片处理繁忙" } }), "原图已上传，图片处理繁忙")
  assert.equal(imageUploadWarning({ processing: { status: "original-only", reason: "no-smaller-variant" } }), null)
  assert.equal(imageUploadWarning({ processing: { status: "ready" } }), null)
  assert.equal(imageUploadWarning({}), null)
})
