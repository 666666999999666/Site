import assert from "node:assert/strict"
import test from "node:test"
import { uploadEmbeddedPostImages } from "../lib/post-images"
import { validatePostCreate } from "../lib/validation"

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

test("embedded image upload preserves prose and code, deduplicates images and supports references", async () => {
  const uploads: File[] = []
  const markdown = `正文\n\n![一](${png} "标题")\n\n![二](${png})\n\n![三][pic]\n\n[pic]: ${gif}\n\n\`![示例](${png})\`\n\n[普通链接](${png})\n\n![站内](/uploads/existing.png)`
  const result = await uploadEmbeddedPostImages(markdown, async (file) => {
    uploads.push(file)
    return `/uploads/image-${uploads.length}.png`
  })
  assert.equal(uploads.length, 2)
  assert.equal(uploads[0].type, "image/png")
  assert.equal(Buffer.from(await uploads[0].arrayBuffer()).toString("base64"), png.split(",")[1])
  assert.equal(result, markdown.replace(`![一](${png}`, "![一](/uploads/image-1.png")
    .replace(`![二](${png}`, "![二](/uploads/image-1.png").replace(`[pic]: ${gif}`, "[pic]: /uploads/image-2.png"))
})

test("a small article with a large embedded image fits the original body limit after upload", async () => {
  const image = "data:image/png;base64," + Buffer.concat([Buffer.from(png.split(",")[1], "base64"), Buffer.alloc(1_600_000)]).toString("base64")
  const content = `几个字\n\n![图片](${image})`
  assert.ok(content.length > 2_000_000)
  const result = await uploadEmbeddedPostImages(content, async () => "/uploads/photo.png")
  assert.equal(result, "几个字\n\n![图片](/uploads/photo.png)")
  assert.equal(validatePostCreate({ title: "几张图片", content: result }).content, result)
})

test("upload retries reuse completed images and propagate failure without returning partial content", async () => {
  const cache = new Map<string, string>()
  const content = `![一](${png})\n\n![二](${gif})`
  let count = 0
  await assert.rejects(uploadEmbeddedPostImages(content, async () => {
    if (++count === 2) throw new Error("图片上传失败")
    return "/uploads/first.png"
  }, cache), /图片上传失败/)
  const result = await uploadEmbeddedPostImages(content, async () => {
    count++
    return "/uploads/second.gif"
  }, cache)
  assert.equal(count, 3)
  assert.equal(result, "![一](/uploads/first.png)\n\n![二](/uploads/second.gif)")
})

test("invalid and oversized embedded images fail before any uploads", async () => {
  let uploads = 0
  const upload = async () => { uploads++; return "/uploads/image.png" }
  await assert.rejects(uploadEmbeddedPostImages(`![一](${png})\n\n![二](data:image/svg+xml;base64,PHN2Zz4=)`, upload), /格式无效/)
  const oversized = "data:image/png;base64," + Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")
  await assert.rejects(uploadEmbeddedPostImages(`![大图](${oversized})`, upload), /图片过大/)
  assert.equal(uploads, 0)
})
