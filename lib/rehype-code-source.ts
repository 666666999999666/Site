import type { Element, Root } from "hast"
import type { Nodes, Root as MarkdownRoot } from "mdast"

export interface CodeBlockSource {
  source: string
  language: string
}

declare module "hast" {
  interface ElementData {
    readerCode?: CodeBlockSource
    readerCodeBlock?: boolean
  }
}

/** Keep the Markdown code value, without the renderer's synthetic final newline. */
export function remarkCodeSource() {
  return (tree: MarkdownRoot) => {
    const visit = (node: Nodes) => {
      if (node.type === "code") {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, dataReaderCodeSource: node.value },
        }
      }
      if ("children" in node) for (const child of node.children) visit(child)
    }
    visit(tree)
  }
}

/** Move raw source to internal AST data before highlighting; never emit it as a DOM attribute. */
export function rehypeCodeSource() {
  return (tree: Root) => {
    const visit = (node: Root | Element) => {
      if (node.type === "element" && node.tagName === "pre") {
        const code = node.children.find((child): child is Element => (
          child.type === "element" && child.tagName === "code"
        ))
        if (code && code.children.every((child) => child.type === "text")) {
          const classes = Array.isArray(code.properties.className) ? code.properties.className : []
          const languageClass = classes.find((value) => String(value).startsWith("language-"))
          node.data = {
            ...node.data,
            readerCode: {
              source: typeof code.properties.dataReaderCodeSource === "string"
                ? code.properties.dataReaderCodeSource
                : code.children.map((child) => child.type === "text" ? child.value : "").join(""),
              language: languageClass ? String(languageClass).slice("language-".length) : "",
            } satisfies CodeBlockSource,
          }
          delete code.properties.dataReaderCodeSource
          code.data = { ...code.data, readerCodeBlock: true }
        }
      }
      for (const child of node.children) {
        if (child.type === "element") visit(child)
      }
    }
    visit(tree)
  }
}

export function codeBlockSource(node: Element | undefined): CodeBlockSource | undefined {
  return node?.data?.readerCode
}
