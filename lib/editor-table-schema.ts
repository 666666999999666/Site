import type { NodeSchema } from "@milkdown/kit/transformer"

/** An empty table cell is already structural; it needs no paragraph marker. */
export function emptyTableCellSchema(schema: NodeSchema): NodeSchema {
  return {
    ...schema,
    toMarkdown: {
      ...schema.toMarkdown,
      runner(state, node) {
        const paragraph = node.firstChild
        if (node.childCount === 1 && paragraph?.type.name === "paragraph" && paragraph.content.size === 0) {
          state.openNode("tableCell").closeNode()
          return
        }
        schema.toMarkdown.runner(state, node)
      },
    },
  }
}
