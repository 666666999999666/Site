import type { Nodes, Root } from "mdast"

/** Read legacy empty-cell markers without enabling or rewriting arbitrary HTML. */
export function remarkEmptyTableCells() {
  return (tree: Root) => {
    const visit = (node: Nodes) => {
      if (node.type === "tableCell" && node.children.length === 1) {
        const child = node.children[0]
        if (child.type === "html" && /^<br\s*\/?>$/i.test(child.value.trim())) {
          node.children = []
          return
        }
      }
      if ("children" in node) for (const child of node.children) visit(child)
    }
    visit(tree)
  }
}
