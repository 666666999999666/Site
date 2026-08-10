import path from "path"
import matter from "gray-matter"
import { fromMarkdown } from "mdast-util-from-markdown"
import { ValidationError } from "./errors"
import { uploadFilePath } from "./uploads"
import { validatePostCreate } from "./validation"

export const MAX_MARKDOWN_BYTES = 2_000_000

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

function isAbsoluteFilePath(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
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

function draftImageReferences(draft: ParsedMarkdownDraft): string[] {
  const references = new Set(imageOccurrences(draft.content).map((item) => item.reference))
  if (draft.coverReference) references.add(draft.coverReference)
  return [...references].sort((left, right) => left.localeCompare(right, "en"))
}

export function markdownLocalImageReferences(draft: ParsedMarkdownDraft): string[] {
  const local: string[] = []
  for (const reference of draftImageReferences(draft)) {
    if (/^https?:\/\//i.test(reference)) {
      if (reference === draft.coverReference) {
        throw new ValidationError("frontmatter cover 只允许本地图片或 /uploads/ 路径")
      }
      continue
    }
    if (reference.startsWith("/uploads/")) {
      if (!uploadFilePath(reference)) throw new ValidationError(`图片引用无效：${reference}`)
      continue
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
    if (!decoded || isAbsoluteFilePath(decoded)) {
      throw new ValidationError(`本地图片必须使用相对路径：${reference}`)
    }
    local.push(reference)
  }
  return local
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
