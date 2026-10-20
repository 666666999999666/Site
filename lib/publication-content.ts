import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"
import { normalizeContent } from "./content"

export const CONTENT_FORMATS = ["ARTICLE", "DIAGRAM", "PRACTICE", "STUDY_NOTE", "ESSAY"] as const
export type ContentFormat = typeof CONTENT_FORMATS[number]

export interface PublicationContent {
  title?: string | null
  excerpt?: string | null
  content?: string | null
  readTime?: number | null
  contentFormat?: string | null
  readHint?: string | null
}

interface MarkdownNode {
  type: string
  value?: string
  alt?: string | null
  lang?: string | null
  children?: MarkdownNode[]
  position?: {
    start: { line: number; column: number; offset?: number }
    end: { line: number; column: number; offset?: number }
  }
}

const MAX_DEPTH = 50
const MAX_WARNINGS = 200
const FORMAT_LABELS: Record<ContentFormat, string> = {
  ARTICLE: "文章", DIAGRAM: "图解", PRACTICE: "实践复盘", STUDY_NOTE: "学习笔记", ESSAY: "随笔",
}

function parseMarkdown(content: string) {
  return fromMarkdown(normalizeContent(content), {
    extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()],
  }) as MarkdownNode
}

function visit(node: MarkdownNode, callback: (node: MarkdownNode) => void, depth = 0) {
  if (depth > MAX_DEPTH) return
  callback(node)
  for (const child of node.children ?? []) visit(child, callback, depth + 1)
}

// Keep the return value plain text. HTML/XML escaping belongs to the output renderer.
function cleanText(text: string) {
  return text.replace(/<[^>]*>/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ").trim()
}

function meaningfulText(text: string) {
  return /[\p{Letter}]/u.test(text)
}

function inlineText(node: MarkdownNode, depth = 0): string {
  if (depth > MAX_DEPTH) return ""
  if (["image", "imageReference", "code", "html", "definition", "footnoteReference"].includes(node.type)) return ""
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? ""
  if (node.type === "break") return " "
  return (node.children ?? []).map((child) => inlineText(child, depth + 1)).join("")
}

function readableBlocks(root: MarkdownNode, title = "") {
  const blocks: string[] = []
  visit(root, (node) => {
    if (!["paragraph", "heading", "tableCell"].includes(node.type)) return
    const text = cleanText(inlineText(node))
    if (meaningfulText(text) && text !== cleanText(title)) blocks.push(text)
  })
  return blocks
}

function plainSummary(raw: string) {
  return readableBlocks(parseMarkdown(raw)).join(" ")
}

export function truncateSummary(text: string, maxLength = 160) {
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 160
  if (!limit) return ""
  const characters = Array.from(text)
  if (characters.length <= limit) return text
  if (limit === 1) return "…"
  const candidate = characters.slice(0, limit - 1).join("")
  const sentences = [...candidate.matchAll(/(?:[。！？!?][”’"']?|\.(?:[”’"']?(?=\s|$)))/gu)]
  const lastSentence = sentences.at(-1)
  if (lastSentence && lastSentence.index + lastSentence[0].length >= candidate.length / 2) {
    return candidate.slice(0, lastSentence.index + lastSentence[0].length).trim()
  }
  const lastSpace = candidate.lastIndexOf(" ")
  return (lastSpace >= candidate.length * 0.65 ? candidate.slice(0, lastSpace) : candidate).trimEnd() + "…"
}

/** One source for cards, RSS, metadata and publication previews; never includes image alts or fenced code. */
function summaryWithRoot(post: PublicationContent, maxLength: number, getRoot: () => MarkdownNode) {
  const excerpt = post.excerpt ? plainSummary(post.excerpt) : ""
  if (excerpt) return truncateSummary(excerpt, maxLength)
  const body = readableBlocks(getRoot(), post.title ?? "").join(" ")
  if (body) return truncateSummary(body, maxLength)
  const title = truncateSummary(plainSummary(post.title ?? ""), 80)
  return truncateSummary(title ? `《${title}》：暂无文字摘要，请查看正文。` : "暂无文字摘要，请查看正文。", maxLength)
}

export function getPostSummary(post: PublicationContent, maxLength = 160) {
  return summaryWithRoot(post, maxLength, () => parseMarkdown(post.content ?? ""))
}

function imageProfile(post: PublicationContent, root = parseMarkdown(post.content ?? "")) {
  let imageCount = 0
  visit(root, (node) => { if (node.type === "image" || node.type === "imageReference") imageCount += 1 })
  return { imageCount, imageOnly: imageCount > 0 && readableBlocks(root, post.title ?? "").length === 0 }
}

function formatLabelWithRoot(post: PublicationContent, getRoot: () => MarkdownNode): string | null {
  if (post.contentFormat && Object.hasOwn(FORMAT_LABELS, post.contentFormat)) {
    return FORMAT_LABELS[post.contentFormat as ContentFormat]
  }
  return imageProfile(post, getRoot()).imageOnly ? "图解" : null
}

function readingLabelWithRoot(post: PublicationContent, getRoot: () => MarkdownNode): string {
  const hint = post.readHint ? cleanText(post.readHint) : ""
  if (hint) return hint
  const { imageCount, imageOnly } = imageProfile(post, getRoot())
  if (imageCount > 0 && (post.contentFormat === "DIAGRAM" || imageOnly)) return `${imageCount} 张图解`
  const minutes = typeof post.readTime === "number" && Number.isFinite(post.readTime)
    ? Math.max(1, Math.ceil(post.readTime))
    : Math.max(1, Math.ceil(readableBlocks(getRoot()).join(" ").length / 300))
  return `${minutes} 分钟阅读`
}

export function getContentFormatLabel(post: PublicationContent): string | null {
  return formatLabelWithRoot(post, () => parseMarkdown(post.content ?? ""))
}

export function getReadingLabel(post: PublicationContent): string {
  return readingLabelWithRoot(post, () => parseMarkdown(post.content ?? ""))
}

/** Derive all public card fields with at most one body parse, then discard the source body. */
export function getPostPresentation(post: PublicationContent, maxLength = 160) {
  let root: MarkdownNode | undefined
  const getRoot = () => root ??= parseMarkdown(post.content ?? "")
  return {
    summary: summaryWithRoot(post, maxLength, getRoot),
    readingLabel: readingLabelWithRoot(post, getRoot),
    contentFormatLabel: formatLabelWithRoot(post, getRoot),
  }
}

export interface PublicationWarning {
  code: "invisible-code-character" | "placeholder-image-alt" | "image-only-summary"
  line: number
  column: number
  offset: number
  message: string
  context: string
  codePoint?: string
  codeBlock?: number
  language?: string
}

export interface PublicationReview {
  warnings: PublicationWarning[]
  totalWarnings: number
  truncated: boolean
  reviewToken: string
  positionSource: "normalized-markdown"
}

// This is a stale-review check, not a credential or a security authorization token.
function reviewFingerprint(post: PublicationContent) {
  const input = JSON.stringify([post.title?.trim() ?? "", post.excerpt?.trim() ?? "", normalizeContent(post.content ?? "")])
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16777619)
  }
  return `publication-v1-${input.length}-${(hash >>> 0).toString(16)}`
}

function codePointLabel(character: string) {
  return `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`
}

const INVISIBLE_CODE_CHARACTER = /[\u00A0\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/gu

/** Read-only contextual checks. No character is rewritten and warnings can be explicitly acknowledged. */
export function scanPublicationContent(post: PublicationContent): PublicationReview {
  const markdown = normalizeContent(post.content ?? "")
  const root = parseMarkdown(markdown)
  const warnings: PublicationWarning[] = []
  let totalWarnings = 0
  let codeBlock = 0
  let images = 0
  const lineStarts = [0]
  for (let offset = 0; offset < markdown.length; offset += 1) {
    if (markdown[offset] === "\n") lineStarts.push(offset + 1)
  }
  function pointAt(offset: number) {
    let low = 0
    let high = lineStarts.length
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (lineStarts[middle] <= offset) low = middle
      else high = middle
    }
    return { line: low + 1, column: offset - lineStarts[low] + 1, offset }
  }
  function add(warning: PublicationWarning) {
    totalWarnings += 1
    if (warnings.length < MAX_WARNINGS) warnings.push(warning)
  }
  visit(root, (node) => {
    if (node.type === "image" || node.type === "imageReference") {
      images += 1
      const alt = cleanText(node.alt ?? "")
      if (!alt || /^[\p{Number}\s.,+\-]+$/u.test(alt) || /^(?:image|img|图片|图像|placeholder)(?:[\s_\-]*\d+)?$/iu.test(alt)) {
        add({
          code: "placeholder-image-alt", ...pointAt(node.position?.start.offset ?? 0),
          message: "图片替代文本可能是占位内容。请结合图片确认；有意使用数字或装饰图可保留。",
          context: alt || "（空替代文本）",
        })
      }
    }
    if (node.type !== "code") return
    codeBlock += 1
    const start = node.position?.start.offset ?? 0
    const end = node.position?.end.offset ?? start
    let offset = start
    const lines = markdown.slice(start, end).split("\n")
    const fenced = /^[ \t>]*(?:`{3,}|~{3,})/.test(lines[0] ?? "")
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const isFence = fenced && (index === 0 || index === lines.length - 1 && /^[ \t>]*(?:`{3,}|~{3,})\s*$/.test(line))
      if (!isFence) {
        for (const match of line.matchAll(INVISIBLE_CODE_CHARACTER)) {
          const codePoint = codePointLabel(match[0])
          add({
            code: "invisible-code-character", ...pointAt(offset + match.index), codePoint,
            codeBlock, language: node.lang ? cleanText(node.lang).slice(0, 50) : undefined,
            message: `${codePoint} 可能影响复制或运行。请确认它位于缩进、标识符、字符串还是注释；有意保留时可确认后发布。`,
            context: line.slice(Math.max(0, match.index - 40), match.index + 41)
              .replace(INVISIBLE_CODE_CHARACTER, (character) => `⟦${codePointLabel(character)}⟧`),
          })
        }
      }
      offset += line.length + 1
    }
  })
  if (images > 0 && readableBlocks(root, post.title ?? "").length === 0 && !plainSummary(post.excerpt ?? "")) {
    add({ code: "image-only-summary", line: 1, column: 1, offset: 0,
      message: "纯图正文缺少独立文字摘要。建议补充摘要和正文文字版，方便订阅、搜索及图片无法加载时阅读。",
      context: `${images} 张图片；当前将使用“暂无文字摘要”的中性说明。` })
  }
  return { warnings, totalWarnings, truncated: totalWarnings > warnings.length,
    reviewToken: reviewFingerprint(post), positionSource: "normalized-markdown" }
}

export function needsPublicationReview(current: PublicationContent & { status: string } | null, next: PublicationContent & { status: string }) {
  return next.status === "PUBLISHED" && (!current || current.status !== "PUBLISHED" ||
    (current.title?.trim() ?? "") !== (next.title?.trim() ?? "") ||
    (current.excerpt?.trim() ?? "") !== (next.excerpt?.trim() ?? "") || current.content !== next.content)
}
