import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, truncate, utimes, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import os from "node:os"
import path from "node:path"
import test, { type TestContext } from "node:test"
import sharp from "sharp"
import { MAX_IMAGE_SOURCE_BYTES, prepareImageVariants, publishPreparedImageVariants, readImageVariantSet } from "../lib/image-variants"
import { imageDerivativeNames } from "../lib/responsive-image"
import { removeUploadFiles, storeImageBuffer, storeImageBufferWithResult } from "../lib/uploads"

const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex")

async function sandbox(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "site-image-variants-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function original(directory: string, name = "image.png", width = 1600) {
  const bytes = await sharp({ create: { width, height: 900, channels: 3, background: "#b47bcb" } }).png().toBuffer()
  const file = path.join(directory, name)
  await writeFile(file, bytes)
  return { file, bytes }
}

test("missing or invalid sidecars do not trigger full reads of historical originals", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const reads = t.mock.method(fs, "createReadStream")
  syncBuiltinESMExports()
  try {
    assert.equal(await readImageVariantSet(source.file), null)
    await writeFile(`${source.file}.qz-image.json`, "{}")
    assert.equal(await readImageVariantSet(source.file), null)
    assert.equal(reads.mock.callCount(), 0)
    await prepareImageVariants(source.file)
    assert.ok(await readImageVariantSet(source.file))
    assert.ok(reads.mock.callCount() > 0)
  } finally {
    reads.mock.restore()
    syncBuiltinESMExports()
  }
})

test("generated variants bind the original and every derivative to SHA256; valid reuse preserves mtime", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const result = await prepareImageVariants(source.file)
  assert.equal(result.status, "ready")
  assert.deepEqual(result.manifest?.variants.map((variant) => variant.width), [640, 960, 1440])
  assert.equal(result.manifest?.sha256, hash(source.bytes))
  assert.deepEqual(await readFile(source.file), source.bytes)
  for (const variant of result.manifest!.variants) {
    const bytes = await readFile(path.join(directory, path.basename(variant.url)))
    assert.equal(hash(bytes), variant.sha256)
    assert.ok(bytes.length < source.bytes.length)
  }
  const sidecar = `${source.file}.qz-image.json`
  await utimes(sidecar, new Date("2020-01-01"), new Date("2020-01-01"))
  const before = await stat(sidecar)
  assert.equal((await prepareImageVariants(source.file)).reused, true)
  assert.equal((await stat(sidecar)).mtimeMs, before.mtimeMs)
  assert.deepEqual(await readImageVariantSet(source.file), result.manifest)
})

test("read rejects same-size mutations of originals and new derivatives", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const prepared = await prepareImageVariants(source.file)
  const variant = prepared.manifest!.variants[0]
  const variantFile = path.join(directory, path.basename(variant.url))
  const bytes = await readFile(variantFile)
  bytes[bytes.length - 1] ^= 1
  await writeFile(variantFile, bytes)
  assert.equal(await readImageVariantSet(source.file), null)
  await prepareImageVariants(source.file)
  const changedSource = Buffer.from(source.bytes)
  changedSource[changedSource.length - 1] ^= 1
  await writeFile(source.file, changedSource)
  assert.equal(await readImageVariantSet(source.file), null)
})

test("legacy v1 requires source SHA but permits absent derivative SHA", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const result = await prepareImageVariants(source.file)
  const legacy = { ...result.manifest!, variants: result.manifest!.variants.map((entry) => ({
    url: entry.url, width: entry.width, height: entry.height, bytes: entry.bytes,
  })) }
  await writeFile(`${source.file}.qz-image.json`, JSON.stringify(legacy))
  assert.ok(await readImageVariantSet(source.file))
  await writeFile(`${source.file}.qz-image.json`, JSON.stringify({ ...legacy, sha256: undefined }))
  assert.equal(await readImageVariantSet(source.file), null)
})

test("small images and animation preserve original bytes and report original-only", async (t) => {
  const directory = await sandbox(t)
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer()
  const file = path.join(directory, "tiny.png")
  await writeFile(file, tiny)
  assert.equal((await prepareImageVariants(file)).status, "original-only")
  assert.deepEqual(await readFile(file), tiny)
  const gif = Buffer.from("47494638396101000100800000000000ffffff21f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024401003b", "hex")
  const animated = path.join(directory, "animated.gif")
  await writeFile(animated, gif)
  assert.equal((await prepareImageVariants(animated)).reason, "animated")
  assert.deepEqual(await readFile(animated), gif)
  assert.equal(await readImageVariantSet(animated), null)
})

test("EXIF orientation remains untouched and requires original-only display", async (t) => {
  const directory = await sandbox(t)
  const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const file = path.join(directory, "oriented.jpg")
  await writeFile(file, bytes)
  assert.equal((await prepareImageVariants(file)).reason, "orientation")
  assert.deepEqual(await readFile(file), bytes)
})

test("source preconditions prevent writing or repairing any target files", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  await writeFile(`${source.file}.qz-image.json`, "existing-invalid-sidecar")
  const result = await prepareImageVariants(source.file, directory, { expectedSourceSha256: "0".repeat(64) })
  assert.equal(result.status, "failed")
  assert.equal(result.reason, "source-changed")
  assert.equal(await readFile(`${source.file}.qz-image.json`, "utf8"), "existing-invalid-sidecar")
  assert.deepEqual(await readFile(source.file), source.bytes)
})

test("the decoder rejects inputs over 40 million pixels without changing original bytes", async (t) => {
  t.mock.method(console, "error", () => {})
  const directory = await sandbox(t)
  const source = await original(directory)
  const bytes = Buffer.from(source.bytes)
  bytes.writeUInt32BE(10_000, 16)
  bytes.writeUInt32BE(10_000, 20)
  let crc = 0xffffffff
  for (const byte of bytes.subarray(12, 29)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29)
  await writeFile(source.file, bytes)
  const result = await prepareImageVariants(source.file)
  assert.equal(result.status, "failed")
  assert.equal(await readImageVariantSet(source.file), null)
  assert.deepEqual(await readFile(source.file), bytes)
})

test("oversized encoded originals fall back explicitly before allocating an encoding snapshot", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  await truncate(source.file, MAX_IMAGE_SOURCE_BYTES + 1)
  const before = await stat(source.file)
  const result = await prepareImageVariants(source.file)
  assert.equal(result.status, "original-only")
  assert.equal(result.reason, "source-too-large")
  assert.ok(result.warning)
  assert.equal((await stat(source.file)).size, MAX_IMAGE_SOURCE_BYTES + 1)
  assert.equal((await stat(source.file)).mtimeMs, before.mtimeMs)
  assert.deepEqual(await readdir(directory), ["image.png"])
})

for (const level of ["output", ".mcp-staging", "image-variants"]) {
  test(`generation and reviewed publication reject a ${level} symlink/junction without touching its target`, async (t) => {
    t.mock.method(console, "error", () => {})
    const directory = await sandbox(t)
    const source = await original(directory)
    const preview = path.join(directory, "preview")
    await prepareImageVariants(source.file, preview)
    const outside = path.join(directory, "outside")
    await mkdir(outside)
    await writeFile(path.join(outside, "marker"), "untouched")
    const output = path.join(directory, "output")
    const link = level === "output" ? output : level === ".mcp-staging"
      ? path.join(output, ".mcp-staging") : path.join(output, ".mcp-staging", "image-variants")
    await mkdir(path.dirname(link), { recursive: true })
    await symlink(outside, link, "junction")
    assert.equal((await prepareImageVariants(source.file, output)).status, "failed")
    assert.equal((await publishPreparedImageVariants(source.file, preview, output, hash(source.bytes))).status, "failed")
    assert.deepEqual(await readdir(outside), ["marker"])
    assert.equal(await readFile(path.join(outside, "marker"), "utf8"), "untouched")
    assert.deepEqual(await readFile(source.file), source.bytes)
  })
}

test("reviewed publication copies the exact prepared bytes and is idempotent", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const preview = path.join(directory, "preview")
  const target = path.join(directory, "target")
  await mkdir(target)
  const prepared = await prepareImageVariants(source.file, preview)
  assert.equal((await publishPreparedImageVariants(source.file, preview, target, "0".repeat(64))).reason, "source-changed")
  assert.deepEqual(await readdir(target), [])
  const published = await publishPreparedImageVariants(source.file, preview, target, hash(source.bytes))
  assert.equal(published.status, "ready")
  for (const variant of prepared.manifest!.variants) {
    const name = path.basename(variant.url)
    assert.deepEqual(await readFile(path.join(target, name)), await readFile(path.join(preview, name)))
  }
  assert.deepEqual(await readImageVariantSet(source.file, target), prepared.manifest)
  const sidecar = path.join(target, "image.png.qz-image.json")
  await utimes(sidecar, new Date("2020-01-01"), new Date("2020-01-01"))
  const before = await stat(sidecar)
  assert.equal((await publishPreparedImageVariants(source.file, preview, target, hash(source.bytes))).reused, true)
  assert.equal((await stat(sidecar)).mtimeMs, before.mtimeMs)
  assert.deepEqual(await readFile(source.file), source.bytes)
})

test("failed publication withdraws the bad manifest, keeps other final files and clears only its staging", async (t) => {
  t.mock.method(console, "error", () => {})
  const directory = await sandbox(t)
  const source = await original(directory)
  const preview = path.join(directory, "preview")
  const target = path.join(directory, "target")
  const prepared = await prepareImageVariants(source.file, preview)
  await mkdir(path.join(target, path.basename(prepared.manifest!.variants[0].url)), { recursive: true })
  await writeFile(path.join(target, "image.png.qz-image.json"), "bad")
  await writeFile(path.join(target, "other.png.qz-640.webp"), "other-publisher")
  assert.equal((await publishPreparedImageVariants(source.file, preview, target, hash(source.bytes))).status, "failed")
  assert.equal(await readImageVariantSet(source.file, target), null)
  assert.equal(await readFile(path.join(target, "other.png.qz-640.webp"), "utf8"), "other-publisher")
  assert.deepEqual(await readdir(path.join(target, ".mcp-staging", "image-variants")), [])
  await assert.rejects(readFile(path.join(target, "image.png.qz-image.json")))
})

test("tampered reviewed resources fail validation before touching the destination", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory)
  const preview = path.join(directory, "preview")
  const target = path.join(directory, "target")
  await mkdir(target)
  const prepared = await prepareImageVariants(source.file, preview)
  const file = path.join(preview, path.basename(prepared.manifest!.variants[0].url))
  const bytes = await readFile(file)
  bytes[bytes.length - 1] ^= 1
  await writeFile(file, bytes)
  assert.equal((await publishPreparedImageVariants(source.file, preview, target, hash(source.bytes))).reason, "invalid-prepared-set")
  assert.deepEqual(await readdir(target), [])
})

test("saturation returns an explicit original-only busy result rather than queuing work", async (t) => {
  const directory = await sandbox(t)
  const source = await original(directory, "image.png", 2400)
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => prepareImageVariants(source.file, path.join(directory, String(index)))))
  assert.ok(results.some((result) => result.status === "ready"))
  assert.ok(results.some((result) => result.reason === "busy" && result.warning))
  assert.deepEqual(await readFile(source.file), source.bytes)
})

test("uploads retain durable originals on derivative failure and deletion removes only their finite family", async (t) => {
  t.mock.method(console, "error", () => {})
  const directory = await sandbox(t)
  const previous = process.env.UPLOAD_DIR
  process.env.UPLOAD_DIR = directory
  t.after(() => { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous })
  const source = await original(directory)
  const uploaded = await storeImageBufferWithResult(source.bytes)
  assert.equal(uploaded.processing.status, "ready")
  assert.deepEqual(await readFile(path.join(directory, path.basename(uploaded.url))), source.bytes)
  await writeFile(path.join(directory, "unrelated.png"), source.bytes)
  assert.equal(await removeUploadFiles(uploaded.url), true)
  for (const filename of [path.basename(uploaded.url), ...imageDerivativeNames(path.basename(uploaded.url))]) {
    await assert.rejects(stat(path.join(directory, filename)))
  }
  assert.deepEqual(await readFile(path.join(directory, "unrelated.png")), source.bytes)
  const invalidPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const fallback = await storeImageBufferWithResult(invalidPng)
  assert.equal(fallback.processing.status, "failed")
  assert.ok(fallback.processing.warning)
  assert.deepEqual(await readFile(path.join(directory, path.basename(fallback.url))), invalidPng)
  assert.match(await storeImageBuffer(invalidPng), /^\/uploads\//)
  await assert.rejects(storeImageBufferWithResult(Buffer.from("not an image")), /有效/)
})
