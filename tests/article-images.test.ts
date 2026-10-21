import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { getArticleImageMetadata } from "../lib/article-images"
import { prepareImageVariants } from "../lib/image-variants"

async function fixture(t: test.TestContext, width = 1280) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "qz-article-images-"))
  const previous = process.env.UPLOAD_DIR
  process.env.UPLOAD_DIR = directory
  t.after(async () => {
    if (previous === undefined) delete process.env.UPLOAD_DIR
    else process.env.UPLOAD_DIR = previous
    await rm(directory, { recursive: true, force: true })
  })
  const original = await sharp({ create: { width, height: width === 1 ? 1 : 900, channels: 3, background: "#286fbc" } })
    .png({ compressionLevel: 0 }).toBuffer()
  const source = path.join(directory, "diagram.png")
  await writeFile(source, original)
  const generated = await prepareImageVariants(source)
  assert.notEqual(generated.status, "failed")
  return { directory, source, original, generated }
}

test("article metadata loads generated sets for inline and reference images without touching Markdown", async t => {
  const { generated } = await fixture(t)
  const content = '文字\n\n![流程图](/uploads/diagram.png "图注 {qz-width=600}")\n\n![重复][图]\n\n[图]: /uploads/diagram.png\n\n![外部](https://example.invalid/image.png)'
  const metadata = await getArticleImageMetadata(content)
  assert.deepEqual(Object.keys(metadata), ["/uploads/diagram.png"])
  assert.equal(metadata["/uploads/diagram.png"].width, 1280)
  assert.deepEqual(metadata["/uploads/diagram.png"].variants, generated.manifest?.variants)
  assert(content.includes('"图注 {qz-width=600}"'))
})

test("same-size source changes and changed variant bytes cause safe original fallback", async t => {
  const { directory, source, original, generated } = await fixture(t)
  assert(generated.manifest?.variants.length)
  const variant = path.join(directory, path.basename(generated.manifest.variants[0].url))
  const bytes = await readFile(variant)
  const changed = Buffer.from(bytes)
  changed[changed.length - 1] ^= 1
  await writeFile(variant, changed)
  assert.deepEqual(await getArticleImageMetadata("![图](/uploads/diagram.png)"), {})
  await writeFile(variant, bytes)
  const changedSource = Buffer.from(original)
  changedSource[changedSource.length - 1] ^= 1
  await writeFile(source, changedSource)
  assert.deepEqual(await getArticleImageMetadata("![图](/uploads/diagram.png)"), {})
})

test("dimension-only sets reserve tiny originals and malformed manifests fall back", async t => {
  const { directory, generated } = await fixture(t, 1)
  assert.equal(generated.status, "original-only")
  const metadata = await getArticleImageMetadata("![小图](/uploads/diagram.png)")
  assert.equal(metadata["/uploads/diagram.png"].width, 1)
  assert.equal(metadata["/uploads/diagram.png"].height, 1)
  assert.deepEqual(metadata["/uploads/diagram.png"].variants, [])
  await writeFile(path.join(directory, "diagram.png.qz-image.json"), "{broken")
  assert.deepEqual(await getArticleImageMetadata("![小图](/uploads/diagram.png)"), {})
})
