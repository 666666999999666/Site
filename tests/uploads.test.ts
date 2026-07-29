import assert from "node:assert/strict"
import test from "node:test"
import { detectImageExtension, uploadFilePath } from "../lib/uploads"

test("detects image signatures instead of trusting MIME metadata", () => {
  assert.equal(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "jpg")
  assert.equal(
    detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "png"
  )
  assert.equal(detectImageExtension(Buffer.from("not an image")), null)
})

test("upload paths cannot escape the uploads directory", () => {
  assert.match(uploadFilePath("/uploads/example.webp") ?? "", /uploads[\\/]example\.webp$/)
  assert.equal(uploadFilePath("/uploads/../secret"), null)
  assert.equal(uploadFilePath("https://example.com/image.png"), null)
})
