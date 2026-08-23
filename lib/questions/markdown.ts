import { fromMarkdown } from "mdast-util-from-markdown"
import { ValidationError } from "@/lib/errors"

interface MarkdownNode {
  type?: string
  url?: string
  value?: string
  children?: MarkdownNode[]
}
const PRIVATE_IMAGE_PATTERN = /^\/api\/questions\/images\/([A-Za-z0-9_-]{1,128})$/
const MAX_MARKDOWN_DEPTH = 50

function parseMarkdown(markdown: string): MarkdownNode {
  try {
    return fromMarkdown(markdown) as MarkdownNode
  } catch {
    throw new ValidationError("Markdown 格式无效")
  }
}

export function extractQuestionImageIds(markdown: string): string[] {
  const ids = new Set<string>()
  const visit = (node: MarkdownNode, depth: number) => {
    if (depth > MAX_MARKDOWN_DEPTH) throw new ValidationError("Markdown 嵌套过深")

    if (node.type === "image") {
      const match = typeof node.url === "string" ? PRIVATE_IMAGE_PATTERN.exec(node.url) : null
      if (!match) {
        throw new ValidationError("图片只能使用问题中学的私有上传地址")
      }
      ids.add(match[1])
    }
    if (node.type === "imageReference") {
      throw new ValidationError("图片必须直接使用问题中学的私有上传地址")
    }
    if (node.type === "html" && /<\s*img\b/i.test(node.value ?? "")) {
      throw new ValidationError("不支持 HTML 图片")
    }

    for (const child of node.children ?? []) visit(child, depth + 1)
  }

  visit(parseMarkdown(markdown), 0)
  return [...ids]
}

export function assertAnswerHasNoImages(markdown: string): void {
  const visit = (node: MarkdownNode, depth: number) => {
    if (depth > MAX_MARKDOWN_DEPTH) throw new ValidationError("Markdown 嵌套过深")
    if (node.type === "image" || node.type === "imageReference") {
      throw new ValidationError("我的答案不支持图片")
    }
    if (node.type === "html" && /<\s*img\b/i.test(node.value ?? "")) {
      throw new ValidationError("我的答案不支持图片")
    }
    for (const child of node.children ?? []) visit(child, depth + 1)
  }
  visit(parseMarkdown(markdown), 0)
}

export function questionImageUrl(id: string): string {
  return `/api/questions/images/${encodeURIComponent(id)}`
}
