import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"

interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
}

function summaryText(node: MarkdownNode, depth = 0): string {
  if (depth > 50) return ""
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      // HTML stays literal text, including ordinary angle brackets; never render it.
      return node.value ?? ""
    case "code":
    case "image":
    case "imageReference":
    case "definition":
    case "footnoteDefinition":
    case "footnoteReference":
    case "thematicBreak":
    case "break":
      return " "
    case "root":
    case "blockquote":
    case "list":
    case "listItem":
    case "table":
    case "tableRow":
      return (node.children ?? []).map((child) => summaryText(child, depth + 1)).join(" ")
    default:
      return (node.children ?? []).map((child) => summaryText(child, depth + 1)).join("")
  }
}

export function ideaSummary(content: string): string {
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const text = summaryText(tree).replace(/\s+/g, " ").trim()
  // Keep the existing 100-character limit without splitting Unicode code points.
  const characters = [...text]
  return characters.slice(0, 100).join("") + (characters.length > 100 ? "…" : "")
}
