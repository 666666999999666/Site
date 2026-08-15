import type { ParsedInboxKind } from "./parser"

export interface InboxBlogMapping {
  title: string
  content: string
  excerpt: null
  categoryId: null
  tags: string[]
  coverImage: null
  draftMetadata: null
  status: "DRAFT"
  publishedAt: null
}

export interface InboxIdeaMapping {
  title: string
  content: string
  tags: string[]
}

export interface InboxTodoMapping {
  title: string
  description: string | null
  status: "TODO"
  priority: null
  dueDate: null
  projectId: null
  completionCriteria: null
  subtasks: []
}

function firstNonEmptyLine(body: string) {
  return body.split(/\r\n?|\n/).find((line) => line.trim().length > 0)?.trim() ?? ""
}

function stripMarkdownHeading(value: string) {
  return value.replace(/^#{1,6}[ \t]*/, "").replace(/\s+/gu, " ").trim()
}

function truncateCodePoints(value: string, maximum: number, appendEllipsis: boolean) {
  const points = Array.from(value)
  if (points.length <= maximum) return value
  return `${points.slice(0, maximum).join("")}${appendEllipsis ? "…" : ""}`
}

function shortContentTitle(body: string, fallback: string) {
  const title = stripMarkdownHeading(firstNonEmptyLine(body)) || fallback
  return truncateCodePoints(title, 30, true)
}

function pureHttpUrlHostname(body: string) {
  const candidate = body.trim()
  if (!candidate || /[\r\n]/u.test(candidate)) return null

  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.hostname || null
  } catch {
    return null
  }
}

function urlDraftTitle(hostname: string) {
  const title = `待整理：${hostname}`
  const points = Array.from(title)
  return points.length <= 200 ? title : `${points.slice(0, 199).join("")}…`
}

export function mapInboxBlog(parsedBody: string): InboxBlogMapping {
  const hostname = pureHttpUrlHostname(parsedBody)
  return {
    title: hostname ? urlDraftTitle(hostname) : shortContentTitle(parsedBody, "未命名文章"),
    content: parsedBody,
    excerpt: null,
    categoryId: null,
    tags: [],
    coverImage: null,
    draftMetadata: null,
    status: "DRAFT",
    publishedAt: null,
  }
}

export function mapInboxIdea(parsedBody: string): InboxIdeaMapping {
  return {
    title: shortContentTitle(parsedBody, "未命名 Idea"),
    content: parsedBody,
    tags: [],
  }
}

export function mapInboxTodo(parsedBody: string): InboxTodoMapping {
  const normalized = parsedBody.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  const titleLineIndex = lines.findIndex((line) => line.trim().length > 0)
  const titleLine = (titleLineIndex >= 0 ? lines[titleLineIndex] : "").trim()
  const title = truncateCodePoints(titleLine || "未命名 Todo", 300, false)
  const titleWasTruncated = Array.from(titleLine).length > 300
  const remaining = titleLineIndex >= 0
    ? lines.slice(titleLineIndex + 1).join("\n").trim()
    : ""

  return {
    title,
    description: titleWasTruncated ? parsedBody : remaining || null,
    status: "TODO",
    priority: null,
    dueDate: null,
    projectId: null,
    completionCriteria: null,
    subtasks: [],
  }
}

export function mapParsedInboxItem(kind: ParsedInboxKind, parsedBody: string) {
  switch (kind) {
    case "BLOG":
      return mapInboxBlog(parsedBody)
    case "IDEA":
      return mapInboxIdea(parsedBody)
    case "TODO":
      return mapInboxTodo(parsedBody)
  }
}
