import { createHash } from "crypto"
import { mkdir, readFile, realpath, stat, unlink } from "fs/promises"
import path from "path"
import matter from "gray-matter"
import { fromMarkdown } from "mdast-util-from-markdown"
import { ValidationError } from "./errors"
import { detectImageExtension, MAX_UPLOAD_BYTES, storeImageBuffer, uploadFilePath } from "./uploads"
import { validatePostCreate } from "./validation"

interface MarkdownPosition {
  start?: { offset?: number }
  end?: { offset?: number }
}

interface MarkdownNode {
  type?: string
  url?: string
  identifier?: string
  children?: MarkdownNode[]
  position?: MarkdownPosition
}

interface ImageOccurrence {
  reference: string
  start: number
  end: number
}

export interface MarkdownImageSnapshot {
  reference: string
  path: string
  digest: string
}

export interface MarkdownImportPayload {
  kind: "create_draft_from_markdown"
  sourcePath: string
  sourceDigest: string
  images: MarkdownImageSnapshot[]
}

export interface PreparedMarkdownImport {
  payload: MarkdownImportPayload
  summary: {
    sourceFile: string
    title: string
    category: string | null
    tags: string[]
    imageCount: number
    sourceDigest: string
  }
}

export interface ParsedMarkdownDraft {
  title: string
  content: string
  excerpt: string | null
  tags: string[]
  categoryReference: string | null
  coverReference: string | null
  draftMetadata: Record<string, unknown> | null
}

function digest(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

function insideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

async function existingRoot(root: string): Promise<string> {
  await mkdir(root, { recursive: true })
  return realpath(root)
}

async function sandboxFile(rootValue: string, input: string, label: string): Promise<string> {
  const root = await existingRoot(rootValue)
  const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input)
  let actual: string
  try {
    actual = await realpath(candidate)
  } catch {
    throw new ValidationError(`${label}不存在`)
  }
  if (!insideRoot(root, actual)) throw new ValidationError(`${label}超出允许目录`)
  const info = await stat(actual)
  if (!info.isFile()) throw new ValidationError(`${label}必须是文件`)
  return actual
}

function stringValue(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") throw new ValidationError(`${label}必须是字符串`)
  return value.trim() || null
}

function tagsValue(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return []
  const values = typeof value === "string" ? value.split(",") : value
  if (!Array.isArray(values)) throw new ValidationError("frontmatter tags 必须是数组或逗号分隔字符串")
  return values.map((item) => {
    if (typeof item !== "string") throw new ValidationError("frontmatter tags 只能包含字符串")
    return item.trim()
  }).filter(Boolean)
}

function normalizedMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new ValidationError("frontmatter 不能转换为 JSON metadata")
  }
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw new ValidationError("frontmatter 不能超过 64KB")
  }
  const result = JSON.parse(serialized) as Record<string, unknown>
  return Object.keys(result).length > 0 ? result : null
}

export function parseMarkdownDraft(sourcePath: string, raw: string): ParsedMarkdownDraft {
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    throw new ValidationError("Markdown frontmatter 格式无效")
  }
  const metadata = normalizedMetadata(parsed.data)
  const title = stringValue(parsed.data.title, "frontmatter title")
    ?? path.basename(sourcePath, path.extname(sourcePath))
  const excerpt = stringValue(
    parsed.data.description ?? parsed.data.excerpt,
    "frontmatter description"
  )
  const categoryReference = stringValue(
    parsed.data.categoryId ?? parsed.data.category,
    "frontmatter category"
  )
  const coverReference = stringValue(
    parsed.data.coverImage ?? parsed.data.cover,
    "frontmatter cover"
  )
  const tags = tagsValue(parsed.data.tags)

  validatePostCreate({
    title,
    content: parsed.content,
    excerpt,
    tags,
    draftMetadata: metadata,
    status: "DRAFT",
  })

  return {
    title,
    content: parsed.content,
    excerpt,
    tags,
    categoryReference,
    coverReference,
    draftMetadata: metadata,
  }
}

function imageOccurrences(markdown: string): ImageOccurrence[] {
  let root: MarkdownNode
  try {
    root = fromMarkdown(markdown) as MarkdownNode
  } catch {
    throw new ValidationError("Markdown 正文无法解析")
  }

  const direct: MarkdownNode[] = []
  const definitions = new Map<string, MarkdownNode>()
  const referenced = new Set<string>()
  const visit = (node: MarkdownNode) => {
    if (node.type === "image" && node.url) direct.push(node)
    if (node.type === "imageReference" && node.identifier) referenced.add(node.identifier.toLowerCase())
    if (node.type === "definition" && node.identifier && node.url) {
      definitions.set(node.identifier.toLowerCase(), node)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(root)

  const nodes = [
    ...direct,
    ...[...referenced].map((identifier) => definitions.get(identifier)).filter(Boolean) as MarkdownNode[],
  ]
  return nodes.map((node) => {
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (typeof start !== "number" || typeof end !== "number" || !node.url) {
      throw new ValidationError("无法定位 Markdown 图片引用")
    }
    return { reference: node.url, start, end }
  })
}

type ImageReference =
  | { kind: "remote" | "uploaded" }
  | { kind: "local"; path: string; buffer: Buffer; digest: string }

async function inspectImageReference(
  reference: string,
  sourcePath: string,
  imageRoot: string
): Promise<ImageReference> {
  if (/^https?:\/\//i.test(reference)) return { kind: "remote" }
  if (reference.startsWith("/uploads/")) {
    if (!uploadFilePath(reference)) throw new ValidationError(`图片引用无效：${reference}`)
    return { kind: "uploaded" }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith("//")) {
    throw new ValidationError(`图片引用协议不允许：${reference}`)
  }

  const pathPart = reference.split(/[?#]/, 1)[0]
  let decoded: string
  try {
    decoded = decodeURIComponent(pathPart)
  } catch {
    throw new ValidationError(`图片路径编码无效：${reference}`)
  }
  if (!decoded || path.isAbsolute(decoded)) {
    throw new ValidationError(`本地图片必须使用相对路径：${reference}`)
  }
  const candidate = path.resolve(path.dirname(sourcePath), decoded)
  const actual = await sandboxFile(imageRoot, candidate, `图片 ${reference}`)
  const buffer = await readFile(actual)
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ValidationError(`图片超过 5MB：${reference}`)
  if (!detectImageExtension(buffer)) throw new ValidationError(`图片内容格式不支持：${reference}`)
  return { kind: "local", path: actual, buffer, digest: digest(buffer) }
}

async function snapshotLocalImages(
  draft: ParsedMarkdownDraft,
  sourcePath: string,
  imageRoot: string
): Promise<MarkdownImageSnapshot[]> {
  const references = new Set(imageOccurrences(draft.content).map((item) => item.reference))
  if (draft.coverReference) references.add(draft.coverReference)
  const snapshots: MarkdownImageSnapshot[] = []
  for (const reference of references) {
    const inspected = await inspectImageReference(reference, sourcePath, imageRoot)
    if (reference === draft.coverReference && inspected.kind === "remote") {
      throw new ValidationError("frontmatter cover 只允许本地图片或 /uploads/ 路径")
    }
    if (inspected.kind === "local") {
      snapshots.push({ reference, path: inspected.path, digest: inspected.digest })
    }
  }
  return snapshots.sort((left, right) => left.reference.localeCompare(right.reference, "en"))
}

export function rewriteMarkdownImageReferences(
  markdown: string,
  replacements: ReadonlyMap<string, string>
): string {
  const edits = imageOccurrences(markdown)
    .filter((occurrence) => replacements.has(occurrence.reference))
    .map((occurrence) => {
      const segment = markdown.slice(occurrence.start, occurrence.end)
      const localIndex = segment.lastIndexOf(occurrence.reference)
      if (localIndex < 0) {
        throw new ValidationError(`无法安全改写图片引用：${occurrence.reference}`)
      }
      return {
        start: occurrence.start + localIndex,
        end: occurrence.start + localIndex + occurrence.reference.length,
        value: replacements.get(occurrence.reference)!,
      }
    })
    .sort((left, right) => right.start - left.start)

  let result = markdown
  for (const edit of edits) {
    result = `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`
  }
  return result
}

export async function prepareMarkdownImport(
  localPath: string,
  config: { markdownRoot: string; imageRoot: string }
): Promise<PreparedMarkdownImport> {
  const sourcePath = await sandboxFile(config.markdownRoot, localPath, "Markdown 文件")
  if (!/\.md(?:own)?$/i.test(sourcePath)) {
    throw new ValidationError("只允许导入 .md 或 .markdown 文件")
  }
  const sourceBuffer = await readFile(sourcePath)
  if (sourceBuffer.length > 2_000_000) throw new ValidationError("Markdown 文件不能超过 2MB")
  const raw = sourceBuffer.toString("utf8")
  const draft = parseMarkdownDraft(sourcePath, raw)
  const images = await snapshotLocalImages(draft, sourcePath, config.imageRoot)

  return {
    payload: {
      kind: "create_draft_from_markdown",
      sourcePath,
      sourceDigest: digest(sourceBuffer),
      images,
    },
    summary: {
      sourceFile: path.basename(sourcePath),
      title: draft.title,
      category: draft.categoryReference,
      tags: draft.tags,
      imageCount: images.length,
      sourceDigest: digest(sourceBuffer),
    },
  }
}

export async function materializeMarkdownImport(
  payload: MarkdownImportPayload,
  config: { markdownRoot: string; imageRoot: string }
) {
  const sourcePath = await sandboxFile(config.markdownRoot, payload.sourcePath, "Markdown 文件")
  const sourceBuffer = await readFile(sourcePath)
  if (digest(sourceBuffer) !== payload.sourceDigest) {
    throw new ValidationError("Markdown 文件在审批后发生变化，请重新发起导入")
  }
  const draft = parseMarkdownDraft(sourcePath, sourceBuffer.toString("utf8"))
  const currentImages = await snapshotLocalImages(draft, sourcePath, config.imageRoot)
  if (JSON.stringify(currentImages) !== JSON.stringify(payload.images)) {
    throw new ValidationError("Markdown 图片在审批后发生变化，请重新发起导入")
  }

  const replacements = new Map<string, string>()
  const storedByPath = new Map<string, string>()
  const createdUrls: string[] = []
  const cleanup = async () => {
    await Promise.allSettled(createdUrls.map(async (url) => {
      const file = uploadFilePath(url)
      if (file) await unlink(file)
    }))
  }
  try {
    const { resolveBlogCategory } = await import("./categories")
    for (const image of currentImages) {
      let url = storedByPath.get(image.path)
      if (!url) {
        const buffer = await readFile(image.path)
        if (digest(buffer) !== image.digest) {
          throw new ValidationError(`图片在导入过程中发生变化：${image.reference}`)
        }
        url = await storeImageBuffer(buffer)
        storedByPath.set(image.path, url)
        createdUrls.push(url)
      }
      replacements.set(image.reference, url)
    }

    const content = rewriteMarkdownImageReferences(draft.content, replacements)
    const categoryId = await resolveBlogCategory(draft.categoryReference)
    const coverImage = draft.coverReference
      ? replacements.get(draft.coverReference) ?? draft.coverReference
      : null
    const input = validatePostCreate({
      title: draft.title,
      content,
      excerpt: draft.excerpt,
      categoryId,
      tags: draft.tags,
      coverImage,
      draftMetadata: draft.draftMetadata,
      status: "DRAFT",
      publishedAt: null,
    })
    return { input, importedImages: createdUrls, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
