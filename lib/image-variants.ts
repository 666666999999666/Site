import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseImageVariantManifest, RESPONSIVE_IMAGE_WIDTHS, SAFE_IMAGE_NAME, type ImageVariantManifest } from "./responsive-image"

export interface ImageVariantResult {
  status: "ready" | "original-only" | "failed"
  reason?: string
  warning?: string
  manifest?: ImageVariantManifest
  reused?: boolean
}

export const MAX_INPUT_PIXELS = 40_000_000
export const MAX_IMAGE_SOURCE_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_BYTES = 16_384
let activeJob = false
let sharpModule: Promise<typeof import("sharp")["default"]> | undefined

async function imageProcessor() {
  sharpModule ??= import("sharp").then(({ default: sharp }) => {
    // One transform job at a time, with serial widths and a small native cache.
    // Saturation falls back to the original rather than queuing decoded images.
    sharp.concurrency(1)
    sharp.cache({ memory: 16, files: 0, items: 16 })
    return sharp
  })
  return sharpModule
}

function filenameOf(sourcePath: string) {
  const filename = path.basename(sourcePath)
  if (!SAFE_IMAGE_NAME.test(filename) || filename.includes(".qz-")) throw new Error("Invalid original image filename")
  return filename
}

async function digest(file: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}

async function sourceIdentity(sourcePath: string) {
  filenameOf(sourcePath)
  const info = await lstat(sourcePath)
  if (!info.isFile() || info.size <= 0) throw new Error("Original image is not a regular nonempty file")
  return { bytes: info.size, sha256: await digest(sourcePath) }
}

async function sourceSnapshot(sourcePath: string) {
  const chunks: Buffer[] = []
  const hash = createHash("sha256")
  let bytes = 0
  for await (const chunk of createReadStream(sourcePath)) {
    bytes += chunk.length
    if (bytes > MAX_IMAGE_SOURCE_BYTES) return null
    chunks.push(chunk)
    hash.update(chunk)
  }
  return { buffer: Buffer.concat(chunks, bytes), bytes, sha256: hash.digest("hex") }
}

function sameSource(left: { bytes: number; sha256: string }, right: { bytes: number; sha256: string }) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function ready(manifest: ImageVariantManifest, reused = false): ImageVariantResult {
  return { status: manifest.variants.length ? "ready" : "original-only",
    ...(!manifest.variants.length ? { reason: "no-smaller-variant" } : {}), manifest, ...(reused ? { reused: true } : {}) }
}

function failed(reason: string): ImageVariantResult {
  const warning = reason === "source-changed" ? "原图已变化，未发布响应式图片；当前保留原图。"
    : reason === "invalid-prepared-set" ? "预览资源校验失败，未发布响应式图片；当前保留原图。"
    : reason === "publication-failed" ? "响应式图片发布失败；当前保留原图。"
    : "原图已保留，响应式图片生成失败；当前使用原图。"
  return { status: "failed", reason, warning }
}

/** Validate the complete immutable set, including same-size source changes. */
export async function readImageVariantSet(sourcePath: string, resourcesDirectory = path.dirname(sourcePath)): Promise<ImageVariantManifest | null> {
  try {
    const filename = filenameOf(sourcePath)
    const manifestPath = path.join(resourcesDirectory, `${filename}.qz-image.json`)
    const info = await lstat(manifestPath)
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) return null
    const manifest = parseImageVariantManifest(JSON.parse(await readFile(manifestPath, "utf8")), filename)
    if (!manifest) return null
    // Most historical images have no sidecar. Do not read their full original
    // merely to discover that there is no responsive set to validate.
    const before = await sourceIdentity(sourcePath)
    if (manifest.sourceBytes !== before.bytes || manifest.sha256 !== before.sha256) return null
    for (const variant of manifest.variants) {
      const file = path.join(resourcesDirectory, path.basename(variant.url))
      const info = await lstat(file)
      if (!info.isFile() || info.size !== variant.bytes || (variant.sha256 && await digest(file) !== variant.sha256)) return null
    }
    return sameSource(before, await sourceIdentity(sourcePath)) ? manifest : null
  } catch { return null }
}

async function realDirectory(directory: string) {
  const absolute = path.resolve(directory)
  const root = path.parse(absolute).root
  let current = root
  // Do not use recursive mkdir: it follows an existing symlink before callers
  // have a chance to reject it. Walk/validate before creating the next child.
  for (const component of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    try { await mkdir(current, { mode: 0o700 }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Image output contains a symlink or non-directory")
    const actual = await realpath(current)
    const normalize = (value: string) => process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value)
    if (normalize(actual) !== normalize(current)) throw new Error("Image output resolves through a symlink or junction")
  }
  return absolute
}

async function stagingDirectory(outputDirectory: string) {
  // Keep staging on the upload mount (not /tmp), behind the existing staging
  // deny/backup rules. MCP bundle cleanup only accepts UUID bundle siblings.
  const parent = await realDirectory(path.join(outputDirectory, ".mcp-staging", "image-variants"))
  const staging = path.join(parent, randomUUID())
  await mkdir(staging, { mode: 0o700 })
  return staging
}

async function publishStaged(sourcePath: string, staging: string, outputDirectory: string, expected: { bytes: number; sha256: string }, manifest: ImageVariantManifest) {
  if (!sameSource(expected, await sourceIdentity(sourcePath))) return failed("source-changed")
  const filename = filenameOf(sourcePath)
  // A failed repair exposes no manifest. Never remove final variants on error:
  // another successful publisher may own them. Only our staging is cleaned up.
  await rm(path.join(outputDirectory, `${filename}.qz-image.json`), { force: true })
  for (const variant of manifest.variants) {
    const name = path.basename(variant.url)
    await rename(path.join(staging, name), path.join(outputDirectory, name))
  }
  if (!sameSource(expected, await sourceIdentity(sourcePath))) return failed("source-changed")
  await rename(path.join(staging, `${filename}.qz-image.json`), path.join(outputDirectory, `${filename}.qz-image.json`))
  if (!sameSource(expected, await sourceIdentity(sourcePath))) return failed("source-changed")
  return ready(manifest)
}

/** Generate a finite set synchronously; callers always retain the original. */
export async function prepareImageVariants(
  sourcePath: string,
  outputDirectory = path.dirname(sourcePath),
  options: { expectedSourceSha256?: string } = {},
): Promise<ImageVariantResult> {
  let staging: string | undefined
  let claimed = false
  try {
    const filename = filenameOf(sourcePath)
    const existing = await readImageVariantSet(sourcePath, outputDirectory)
    if (existing) return !options.expectedSourceSha256 || existing.sha256 === options.expectedSourceSha256 ? ready(existing, true) : failed("source-changed")
    if (activeJob) return { status: "original-only", reason: "busy", warning: "原图已上传，图片处理繁忙；当前使用原图。" }
    activeJob = claimed = true
    const info = await lstat(sourcePath)
    if (!info.isFile() || info.size <= 0) throw new Error("Original image is not a regular nonempty file")
    const snapshot = info.size <= MAX_IMAGE_SOURCE_BYTES ? await sourceSnapshot(sourcePath) : null
    if (!snapshot) return { status: "original-only", reason: "source-too-large", warning: "原图已保留，图片文件超过自动处理资源上限（32 MB）；当前使用原图。" }
    const expected = { bytes: snapshot.bytes, sha256: snapshot.sha256 }
    if (info.size !== snapshot.bytes || options.expectedSourceSha256 && options.expectedSourceSha256 !== expected.sha256) return failed("source-changed")
    if (!sameSource(expected, await sourceIdentity(sourcePath))) return failed("source-changed")
    staging = await stagingDirectory(outputDirectory)
    await rm(path.join(outputDirectory, `${filename}.qz-image.json`), { force: true })
    const sharp = await imageProcessor()
    const metadata = await sharp(snapshot.buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: true }).metadata()
    if (!metadata.width || !metadata.height || metadata.width > 100_000 || metadata.height > 100_000) throw new Error("Image dimensions unavailable or out of range")
    if ((metadata.pages ?? 1) > 1 || metadata.orientation && metadata.orientation !== 1) {
      if (!sameSource(expected, await sourceIdentity(sourcePath))) return failed("source-changed")
      return { status: "original-only", reason: (metadata.pages ?? 1) > 1 ? "animated" : "orientation" }
    }
    const variants: ImageVariantManifest["variants"] = []
    for (const width of RESPONSIVE_IMAGE_WIDTHS) {
      if (width > metadata.width) continue
      const { data, info } = await sharp(snapshot.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer({ resolveWithObject: true })
      if (data.length >= expected.bytes) continue
      const name = `${filename}.qz-${width}.webp`
      await writeFile(path.join(staging, name), data, { flag: "wx" })
      variants.push({ url: `/uploads/${name}`, width: info.width, height: info.height, bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex") })
    }
    const manifest: ImageVariantManifest = { version: 1, original: filename, sha256: expected.sha256,
      width: metadata.width, height: metadata.height, sourceBytes: expected.bytes, variants }
    await writeFile(path.join(staging, `${filename}.qz-image.json`), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" })
    return await publishStaged(sourcePath, staging, outputDirectory, expected, manifest)
  } catch (error) {
    console.error("[ImageVariantPreparationFailed]", path.basename(sourcePath), error instanceof Error ? error.message : "Unknown error")
    return failed("processing-failed")
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    if (claimed) activeJob = false
  }
}

/** Publish the reviewed bytes, without running an encoder on the destination. */
export async function publishPreparedImageVariants(
  sourcePath: string,
  preparedDirectory: string,
  outputDirectory: string,
  expectedSourceSha256: string,
): Promise<ImageVariantResult> {
  let staging: string | undefined
  let claimed = false
  try {
    const filename = filenameOf(sourcePath)
    const expected = await sourceIdentity(sourcePath)
    if (expected.sha256 !== expectedSourceSha256) return failed("source-changed")
    const prepared = await readImageVariantSet(sourcePath, preparedDirectory)
    if (!prepared) return failed("invalid-prepared-set")
    if (prepared.sha256 !== expected.sha256 || prepared.sourceBytes !== expected.bytes) return failed("source-changed")
    const existing = await readImageVariantSet(sourcePath, outputDirectory)
    if (existing) return existing.sha256 === expected.sha256 && existing.sourceBytes === expected.bytes ? ready(existing, true) : failed("source-changed")
    if (activeJob) return { status: "original-only", reason: "busy", warning: "原图已保留，图片处理繁忙；未发布响应式图片。" }
    activeJob = claimed = true
    staging = await stagingDirectory(outputDirectory)
    for (const variant of prepared.variants) {
      const name = path.basename(variant.url)
      await copyFile(path.join(preparedDirectory, name), path.join(staging, name))
    }
    await writeFile(path.join(staging, `${filename}.qz-image.json`), JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" })
    if (!await readImageVariantSet(sourcePath, staging)) return failed("invalid-prepared-set")
    return await publishStaged(sourcePath, staging, outputDirectory, expected, prepared)
  } catch (error) {
    console.error("[ImageVariantPublicationFailed]", path.basename(sourcePath), error instanceof Error ? error.message : "Unknown error")
    return failed("publication-failed")
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    if (claimed) activeJob = false
  }
}
