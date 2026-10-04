type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
}

// 只调整显示用的 AST，保留纯文本换行，不修改正文或猜测标题。
export function remarkPreserveSoftBreaks() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return
      const children: MarkdownNode[] = []
      for (const child of node.children) {
        visit(child)
        if (child.type !== "text" || !child.value?.includes("\n")) {
          children.push(child)
          continue
        }
        child.value.split("\n").forEach((part, index, parts) => {
          if (part) children.push({ ...child, value: part })
          if (index < parts.length - 1) children.push({ type: "break" })
        })
      }
      node.children = children
    }
    visit(tree)
  }
}
