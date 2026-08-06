import { fromMarkdown } from "mdast-util-from-markdown"

export interface ContentHeading {
  id: string
  text: string
  level: number
}

interface TiptapMark {
  type?: string
  attrs?: Record<string, unknown>
}

interface TiptapNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: TiptapMark[]
  content?: TiptapNode[]
}

interface MarkdownNode {
  type?: string
  depth?: number
  value?: string
  alt?: string
  children?: MarkdownNode[]
}

// #1: 递归遍历节点树的最大深度，防止恶意构造的超深嵌套触发 RangeError DoS。
const MAX_CONTENT_DEPTH = 50

function parseTiptapDocument(raw: string): TiptapNode | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) return null

  try {
    const value = JSON.parse(trimmed) as TiptapNode
    return value?.type === "doc" && Array.isArray(value.content) ? value : null
  } catch {
    return null
  }
}

export function isTiptapJson(raw: string): boolean {
  return parseTiptapDocument(raw) !== null
}

export function extractTiptapPlainText(raw: string): string | null {
  const document = parseTiptapDocument(raw)
  return document ? rawText(document) : null
}

function childrenOf(node: TiptapNode): TiptapNode[] {
  return Array.isArray(node.content) ? node.content : []
}

function rawText(node: TiptapNode, depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  return childrenOf(node).map((child) => rawText(child, depth + 1)).join("")
}

function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_[\]<>~])/g, "\\$1")
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const fence = "`".repeat(Math.max(1, ...runs.map((run) => run.length + 1)))
  const needsPadding = /^`|`$|^\s|\s$/.test(text)
  return needsPadding ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`
}

function safeLinkDestination(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\s/g, "%20").replace(/\)/g, "%29")
}

function renderTextNode(node: TiptapNode): string {
  const text = node.text ?? ""
  const marks = Array.isArray(node.marks) ? node.marks : []

  if (marks.some((mark) => mark.type === "code")) {
    return codeSpan(text)
  }

  let rendered = escapeInlineText(text)
  const hasBold = marks.some((mark) => mark.type === "bold" || mark.type === "strong")
  const hasItalic = marks.some((mark) => mark.type === "italic" || mark.type === "em")
  const hasStrike = marks.some((mark) => mark.type === "strike")

  if (hasBold && hasItalic) rendered = `***${rendered}***`
  else if (hasBold) rendered = `**${rendered}**`
  else if (hasItalic) rendered = `*${rendered}*`
  if (hasStrike) rendered = `~~${rendered}~~`

  const link = marks.find((mark) => mark.type === "link")
  if (link) {
    const href = safeLinkDestination(link.attrs?.href)
    if (href) {
      const title = typeof link.attrs?.title === "string" && link.attrs.title
        ? ` "${link.attrs.title.replace(/"/g, '\\"')}"`
        : ""
      rendered = `[${rendered}](${href}${title})`
    }
  }

  return rendered
}

function renderInline(nodes: TiptapNode[], depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  return nodes.map((node) => {
    if (node.type === "text") return renderTextNode(node)
    if (node.type === "hardBreak") return "<br>\n"
    if (node.type === "image") {
      const src = safeLinkDestination(node.attrs?.src)
      const alt = typeof node.attrs?.alt === "string"
        ? node.attrs.alt.replace(/[[\]]/g, "\\$&")
        : ""
      return src ? `![${alt}](${src})` : ""
    }
    return renderInline(childrenOf(node), depth + 1)
  }).join("")
}

function codeFence(text: string): string {
  const runs = text.match(/`{3,}/g) ?? []
  return "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)))
}

function indentLines(value: string, indent: string): string {
  return value.split("\n").map((line) => `${indent}${line}`).join("\n")
}

function renderList(node: TiptapNode, indent = "", depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  const ordered = node.type === "orderedList"
  const start = typeof node.attrs?.start === "number" && Number.isInteger(node.attrs.start)
    ? node.attrs.start
    : 1

  return childrenOf(node).map((item, index) => {
    const marker = ordered ? `${start + index}. ` : "- "
    const continuation = `${indent}${" ".repeat(marker.length)}`
    const itemChildren = childrenOf(item)
    const checked = item.type === "taskItem" && typeof item.attrs?.checked === "boolean"
      ? `[${item.attrs.checked ? "x" : " "}] `
      : ""

    let output = `${indent}${marker}${checked}`
    let hasFirstBlock = false

    for (const child of itemChildren) {
      if (child.type === "paragraph") {
        const paragraph = renderInline(childrenOf(child), depth + 1)
        if (!hasFirstBlock) {
          output += paragraph
          hasFirstBlock = true
        } else {
          output += `\n${continuation}${paragraph}`
        }
      } else if (
        child.type === "bulletList" ||
        child.type === "orderedList" ||
        child.type === "taskList"
      ) {
        output += `\n${renderList(child, `${indent}  `, depth + 1)}`
        hasFirstBlock = true
      } else {
        const block = renderBlock(child, depth + 1).trim()
        if (block) {
          output += `\n${indentLines(block, continuation)}`
          hasFirstBlock = true
        }
      }
    }

    return output.trimEnd()
  }).join("\n")
}

function tableCellText(node: TiptapNode, depth = 0): string {
  return rawText(node, depth).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|")
}

function renderTable(node: TiptapNode, depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  const rows = childrenOf(node).filter((row) => row.type === "tableRow")
  if (rows.length === 0) return ""

  const cells = rows.map((row) => childrenOf(row).map((cell) => tableCellText(cell, depth + 1)))
  const columnCount = Math.max(...cells.map((row) => row.length), 1)
  const normalized = cells.map((row) => [
    ...row,
    ...Array(Math.max(0, columnCount - row.length)).fill(""),
  ])
  const rowLine = (row: string[]) => `| ${row.join(" | ")} |`
  const separator = `| ${Array(columnCount).fill("---").join(" | ")} |`

  return [rowLine(normalized[0]), separator, ...normalized.slice(1).map(rowLine)].join("\n")
}

function renderBlock(node: TiptapNode, depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  switch (node.type) {
    case "doc":
      return childrenOf(node).map((child) => renderBlock(child, depth + 1)).filter(Boolean).join("\n\n")
    case "paragraph":
      return renderInline(childrenOf(node), depth + 1)
    case "heading": {
      const rawLevel = typeof node.attrs?.level === "number" ? node.attrs.level : 2
      const level = Math.min(6, Math.max(1, Math.trunc(rawLevel)))
      return `${"#".repeat(level)} ${renderInline(childrenOf(node), depth + 1)}`
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return renderList(node, "", depth + 1)
    case "blockquote": {
      const content = childrenOf(node).map((child) => renderBlock(child, depth + 1)).filter(Boolean).join("\n\n")
      return content.split("\n").map((line) => `> ${line}`).join("\n")
    }
    case "codeBlock": {
      const text = rawText(node, depth + 1)
      const language = typeof node.attrs?.language === "string"
        ? node.attrs.language.replace(/[^\w+-]/g, "")
        : ""
      const fence = codeFence(text)
      return `${fence}${language}\n${text}\n${fence}`
    }
    case "horizontalRule":
      return "---"
    case "image":
      return renderInline([node], depth + 1)
    case "table":
      return renderTable(node, depth + 1)
    case "hardBreak":
      return "<br>"
    case "text":
      return renderTextNode(node)
    default:
      return childrenOf(node).map((child) => renderBlock(child, depth + 1)).filter(Boolean).join("\n\n")
  }
}

export function tiptapToMarkdown(raw: string): string {
  const document = parseTiptapDocument(raw)
  if (!document) return raw

  return renderBlock(document)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function normalizeContent(raw: string): string {
  const markdown = isTiptapJson(raw) ? tiptapToMarkdown(raw) : raw
  return markdown.replace(/\r\n?/g, "\n")
}

export function normalizeContentForDisplay(raw: string): string {
  return normalizeContent(raw).replace(/^[\t ]*<br\s*\/?>[\t ]*$/gim, "&nbsp;")
}

export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")

  return slug || "section"
}

export function createHeadingSlugger() {
  const counts = new Map<string, number>()

  return (text: string) => {
    const base = slugifyHeading(text)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen}`
  }
}

function markdownNodeText(node: MarkdownNode, depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH) return ""
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
    return node.value ?? ""
  }
  if (node.type === "image") return node.alt ?? ""
  return (node.children ?? []).map((child) => markdownNodeText(child, depth + 1)).join("")
}

export function extractHeadings(raw: string, levels = [2, 3, 4]): ContentHeading[] {
  const markdown = normalizeContent(raw)
  const slug = createHeadingSlugger()

  try {
    const root = fromMarkdown(markdown) as MarkdownNode
    const headings: ContentHeading[] = []

    const visit = (node: MarkdownNode, depth = 0) => {
      if (depth > MAX_CONTENT_DEPTH) return
      if (node.type === "heading" && typeof node.depth === "number" && levels.includes(node.depth)) {
        const text = markdownNodeText(node).trim()
        if (text) headings.push({ id: slug(text), text, level: node.depth })
      }
      for (const child of node.children ?? []) visit(child, depth + 1)
    }

    visit(root)
    return headings
  } catch {
    return []
  }
}

export function extractPlainText(raw: string): string {
  const markdown = normalizeContent(raw)
  try {
    return markdownNodeText(fromMarkdown(markdown) as MarkdownNode)
  } catch {
    return markdown
  }
}

export function extractUploadUrls(raw: string): string[] {
  const values = new Set<string>()
  const candidates = [raw, normalizeContent(raw)]
  const pattern = /\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*/g

  for (const candidate of candidates) {
    for (const match of candidate.matchAll(pattern)) values.add(match[0])
  }

  return [...values]
}
