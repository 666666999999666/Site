import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { hasNoUploadReferences } from "../lib/upload-reference-policy"
import { detectImageExtension, uploadFilePath } from "../lib/uploads"
import { collectReferencedUploadNames } from "../scripts/upload-references"

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

test("series cover references prevent shared upload deletion", async () => {
  assert.equal(hasNoUploadReferences({ postCount: 0, projectCount: 0, seriesCount: 1 }), false)
  assert.equal(hasNoUploadReferences({ postCount: 0, projectCount: 0, seriesCount: 0 }), true)

  const runtimeCleanup = await readFile(new URL("../lib/uploads-cleanup.ts", import.meta.url), "utf8")
  assert.match(runtimeCleanup, /prisma\.series\.count\([\s\S]*?coverImage:\s*url/)
  assert.match(runtimeCleanup, /hasNoUploadReferences\(\{ postCount, projectCount, seriesCount \}\)/)
})

test("series covers are included in orphan upload reference collection", async () => {
  const referenced = collectReferencedUploadNames(
    [{ content: "![正文](/uploads/body.png)", coverImage: "/uploads/post.png" }],
    [{ coverImage: "/uploads/project.png" }],
    [{ coverImage: "/uploads/series.png" }]
  )

  assert.deepEqual([...referenced].sort(), ["body.png", "post.png", "project.png", "series.png"])

  const cleanupScript = await readFile(new URL("../scripts/cleanup-uploads.ts", import.meta.url), "utf8")
  assert.match(cleanupScript, /SELECT "coverImage" FROM "Series"/)
  assert.match(cleanupScript, /collectReferencedUploadNames\(posts\.rows, projects\.rows, series\.rows\)/)
})
