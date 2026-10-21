import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test, { type TestContext } from "node:test"
import sharp from "sharp"
import {
  createHistoricalImageBackfill,
  HISTORICAL_IMAGE_FILENAMES,
  IMAGE_BACKFILL_PREVIEW_TTL_MS,
  validateImageBackfillExecution,
} from "../lib/historical-image-backfill"
import { readImageVariantSet } from "../lib/image-variants"

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "site-historical-backfill-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const original = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#537cad" } })
    .png({ compressionLevel: 0 }).toBuffer()
  const filename = HISTORICAL_IMAGE_FILENAMES[0]
  const file = path.join(directory, filename)
  await writeFile(file, original)
  return { directory, filename, file, original, service: createHistoricalImageBackfill({ directory }) }
}

test("preview inventories exactly six approved uploads without creating files", async (t) => {
  const f = await fixture(t)
  await writeFile(path.join(f.directory, "other.png"), f.original)
  const before = await readdir(f.directory)
  const preview = await f.service.preview("admin")
  assert.equal(preview.entries.length, 6)
  assert.deepEqual(preview.entries.map((item) => item.filename), HISTORICAL_IMAGE_FILENAMES)
  assert.equal(preview.entries[0].status, "pending")
  assert.equal(preview.entries[0].sourceSha256, createHash("sha256").update(f.original).digest("hex"))
  assert.deepEqual(preview.entries[0].plannedFiles, [
    `${f.filename}.qz-640.webp`, `${f.filename}.qz-960.webp`, `${f.filename}.qz-1440.webp`, `${f.filename}.qz-image.json`,
  ])
  assert.equal(preview.entries.filter((item) => item.status === "failed").length, 5)
  assert.deepEqual(await readdir(f.directory), before)
})

test("execution requires a real current preview bound to its authenticated owner", async (t) => {
  const f = await fixture(t)
  const preview = await f.service.preview("admin")
  await assert.rejects(f.service.execute("admin", { previewToken: "0".repeat(36), filenames: [f.filename] }), /预览/)
  await assert.rejects(f.service.execute("other", { previewToken: preview.previewToken, filenames: [f.filename] }), /预览/)
  assert.deepEqual(await readdir(f.directory), [f.filename])
})

test("only explicitly selected approved images are generated, originals stay unchanged, and repeats skip", async (t) => {
  const f = await fixture(t)
  await writeFile(path.join(f.directory, HISTORICAL_IMAGE_FILENAMES[1]), f.original)
  const preview = await f.service.preview("admin")
  const input = { previewToken: preview.previewToken, filenames: [f.filename] }
  const result = await f.service.execute("admin", input)
  assert.equal(result.entries[0].status, "ready")
  assert.equal(result.failed, 0)
  assert.ok(await readImageVariantSet(f.file))
  assert.equal(await readImageVariantSet(path.join(f.directory, HISTORICAL_IMAGE_FILENAMES[1])), null)
  assert.deepEqual(await readFile(f.file), f.original)
  const manifest = `${f.file}.qz-image.json`
  await utimes(manifest, new Date("2020-01-01"), new Date("2020-01-01"))
  const before = await stat(manifest)
  assert.equal((await f.service.execute("admin", input)).entries[0].status, "skipped")
  assert.equal((await stat(manifest)).mtimeMs, before.mtimeMs)
  assert.equal((await f.service.preview("admin")).entries[0].status, "skipped")
})

test("source bytes changing after preview refuse execution without publishing any sidecars", async (t) => {
  const f = await fixture(t)
  const preview = await f.service.preview("admin")
  const changed = Buffer.from(f.original)
  changed[changed.length - 1] ^= 1
  await writeFile(f.file, changed)
  const result = await f.service.execute("admin", { previewToken: preview.previewToken, filenames: [f.filename] })
  assert.equal(result.entries[0].status, "failed")
  assert.equal(result.entries[0].reason, "source-changed")
  assert.deepEqual(await readdir(f.directory), [f.filename])
  assert.deepEqual(await readFile(f.file), changed)
})

test("missing images fail separately and repaired images can retry after a new preview", async (t) => {
  const f = await fixture(t)
  const missing = HISTORICAL_IMAGE_FILENAMES[1]
  const preview = await f.service.preview("admin")
  const result = await f.service.execute("admin", { previewToken: preview.previewToken, filenames: [f.filename, missing] })
  assert.equal(result.entries[0].status, "ready")
  assert.equal(result.entries[1].status, "failed")
  assert.equal(result.failed, 1)
  await writeFile(path.join(f.directory, missing), f.original)
  const retryPreview = await f.service.preview("admin")
  const retry = await f.service.execute("admin", { previewToken: retryPreview.previewToken, filenames: [missing] })
  assert.equal(retry.entries[0].status, "ready")
  assert.deepEqual(await readFile(path.join(f.directory, missing)), f.original)
})

test("expired and bounded-out previews require a fresh explicit review", async (t) => {
  const f = await fixture(t)
  let now = 1_000
  const service = createHistoricalImageBackfill({ directory: f.directory, now: () => now })
  const preview = await service.preview("admin")
  now += IMAGE_BACKFILL_PREVIEW_TTL_MS
  await assert.rejects(service.execute("admin", { previewToken: preview.previewToken, filenames: [f.filename] }), /预览/)
  const evicted = await service.preview("admin")
  for (let index = 0; index < 24; index++) await service.preview("admin")
  await assert.rejects(service.execute("admin", { previewToken: evicted.previewToken, filenames: [f.filename] }), /预览/)
})

test("duplicate clicks do not start overlapping jobs or silently queue work", async (t) => {
  const f = await fixture(t)
  const preview = await f.service.preview("admin")
  const input = { previewToken: preview.previewToken, filenames: [f.filename] }
  const first = f.service.execute("admin", input)
  await assert.rejects(f.service.execute("admin", input), /处理中/)
  assert.equal((await first).entries[0].status, "ready")
})

test("a failed generation reports failure and can retry the reviewed source without overwriting the original", async (t) => {
  t.mock.method(console, "error", () => {})
  const f = await fixture(t)
  const preview = await f.service.preview("admin")
  const input = { previewToken: preview.previewToken, filenames: [f.filename] }
  const stagingBlock = path.join(f.directory, ".mcp-staging")
  await writeFile(stagingBlock, "not a staging directory")
  const result = await f.service.execute("admin", input)
  assert.equal(result.entries[0].status, "failed")
  assert.equal(result.failed, 1)
  assert.match(result.entries[0].message, /失败.*原图保留/)
  assert.equal(await readImageVariantSet(f.file), null)
  assert.deepEqual(await readFile(f.file), f.original)
  await rm(stagingBlock)
  assert.equal((await f.service.execute("admin", input)).entries[0].status, "ready")
  assert.deepEqual(await readFile(f.file), f.original)
})

test("upload directory symlinks or junctions cannot redirect the fixed allowlist outside its root", async (t) => {
  const f = await fixture(t)
  const link = `${f.directory}-junction`
  try { await symlink(f.directory, link, "junction") }
  catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return t.skip("Windows sandbox does not permit directory links; Linux runner verifies this boundary")
    throw error
  }
  t.after(() => rm(link, { force: true, recursive: true }))
  const service = createHistoricalImageBackfill({ directory: link })
  const preview = await service.preview("admin")
  assert.equal(preview.entries[0].status, "failed")
  assert.equal(preview.entries[0].reason, "unsafe-path")
  assert.deepEqual(await readdir(f.directory), [f.filename])
})

test("symbolic originals are rejected without reading or writing their target", async (t) => {
  const f = await fixture(t)
  const external = path.join(f.directory, "external.png")
  await writeFile(external, f.original)
  await rm(f.file)
  try { await symlink(external, f.file, "file") }
  catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return t.skip("Windows sandbox does not permit file symlinks; Linux runner verifies this boundary")
    throw error
  }
  const preview = await f.service.preview("admin")
  assert.equal(preview.entries[0].status, "failed")
  assert.deepEqual(await readFile(external), f.original)
})

test("execution validation refuses arbitrary paths, external URLs, excess, duplicates and unknown keys", () => {
  const filename = HISTORICAL_IMAGE_FILENAMES[0]
  const previewToken = "12345678-1234-1234-1234-123456789012"
  assert.deepEqual(validateImageBackfillExecution({ previewToken, filenames: [filename] }), { previewToken, filenames: [filename] })
  for (const input of [
    {}, { previewToken, filenames: [] }, { previewToken, filenames: [filename, filename] },
    { previewToken, filenames: Array(7).fill(filename) }, { previewToken, filenames: ["../private.png"] },
    { previewToken, filenames: ["https://example.com/image.png"] }, { previewToken, filenames: [`/uploads/${filename}`] },
    { previewToken, filenames: [filename], path: "C:\\private" }, { previewToken: 1, filenames: [filename] },
    { previewToken, filenames: "all" }, { previewToken, filenames: ["unlisted.png"] },
  ]) assert.throws(() => validateImageBackfillExecution(input), /./)
})

test("API authenticates reads and writes, uses existing CSRF and private no-store helpers", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/admin/image-variants/route.ts"), "utf8")
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.equal((route.match(/await ensureAuthenticated\(\)/g) || []).length, 2)
  assert.match(route, /requireJsonRequest\(request\)/)
  assert.match(route, /privateNoStore/)
  assert.match(route, /handlePrivateApiError/)
})
