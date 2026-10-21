import assert from "node:assert/strict"
import test from "node:test"
import type { NodeSchema } from "@milkdown/kit/transformer"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Root, Table } from "mdast"
import { emptyTableCellSchema } from "../lib/editor-table-schema"
import { remarkEmptyTableCells } from "../lib/remark-empty-table-cells"

test("three by six editor tables serialize fifteen empty paragraphs as empty header/cells", async () => {
  const { Schema } = await import("@milkdown/kit/prose/model")
  const { SerializerState } = await import("@milkdown/kit/transformer")
  const { remark } = await import("remark")
  const unused = { match: () => false, runner() {} }
  const doc: NodeSchema = { content: "block+", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === "doc", runner: (state, node) => { state.openNode("root"); state.next(node.content) } } }
  const text: NodeSchema = { group: "inline", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === "text", runner: (state, node) => { state.addNode("text", undefined, node.text) } } }
  const paragraph: NodeSchema = { content: "inline*", group: "block", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === "paragraph", runner: (state, node) => {
      state.openNode("paragraph")
      // The production Milkdown paragraph schema preserves empty paragraphs this way.
      if (!node.content.size) state.addNode("html", undefined, "<br />")
      else state.next(node.content)
      state.closeNode()
    } } }
  const table: NodeSchema = { content: "table_row+", group: "block", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === "table", runner: (state, node) => { state.openNode("table"); state.next(node.content); state.closeNode() } } }
  const row: NodeSchema = { content: "(table_header | table_cell)+", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === "table_row", runner: (state, node) => { state.openNode("tableRow"); state.next(node.content); state.closeNode() } } }
  const cell = (name: string): NodeSchema => emptyTableCellSchema({ content: "paragraph", parseMarkdown: unused,
    toMarkdown: { match: (node) => node.type.name === name, runner: (state, node) => { state.openNode("tableCell"); state.next(node.content); state.closeNode() } } })
  const schema = new Schema({ nodes: { doc, text, paragraph, table, table_row: row, table_header: cell("table_header"), table_cell: cell("table_cell") } })
  const document = schema.node("doc", null, [schema.node("table", null, Array.from({ length: 3 }, (_, row) => (
    schema.node("table_row", null, Array.from({ length: 6 }, (_, column) => schema.node(row === 0 ? "table_header" : "table_cell", null, [
      schema.node("paragraph", null, row === 0 && column < 3 ? schema.text(["首格甲", "首格乙", "首格丙"][column]) : []),
    ])))
  )))])
  const processor = remark().use(remarkGfm)
  const markdown = SerializerState.create(schema, processor)(document)
  assert.doesNotMatch(markdown, /<br/i)
  const saved = processor.parse(markdown).children[0] as Table
  assert.equal(saved.children.length, 3)
  assert.deepEqual(saved.children.map((row) => row.children.length), [6, 6, 6])
  assert.equal(saved.children.flatMap((row) => row.children).filter((cell) => cell.children.length === 0).length, 15)
})

test("only legacy sole raw HTML break nodes in table cells become empty", async () => {
  const { remark } = await import("remark")
  const markdown = "| A | <br /> | `<br />` | \\<br /> | before <br /> after |\n| - | - | - | - | - |\n| <br> | B | C | D | E |\n\n`<br />`\n\n```html\n<br>\n<br />\n```\n\n有意显示：\\<br />"
  const processor = remark().use(remarkGfm).use(remarkEmptyTableCells)
  const tree = processor.runSync(processor.parse(markdown)) as Root
  const table = tree.children[0] as Table
  assert.equal(table.children[0].children[1].children.length, 0)
  assert.equal(table.children[1].children[0].children.length, 0)
  assert.deepEqual(table.children[0].children[2].children, [{ type: "inlineCode", value: "<br />", position: table.children[0].children[2].children[0].position }])
  const rendered = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkEmptyTableCells] }, markdown))
  assert.match(rendered, /<th><\/th>/)
  assert.match(rendered, /<td><\/td>/)
  assert.match(rendered, /<code>&lt;br \/&gt;<\/code>/)
  assert.match(rendered, /before &lt;br \/&gt; after/)
  assert.match(rendered, /有意显示：&lt;br \/&gt;/)
  assert.match(rendered, /<code class="language-html">&lt;br&gt;\n&lt;br \/&gt;\n<\/code>/)
})

test("arbitrary HTML in table cells remains escaped text", () => {
  const markdown = '| label | content |\n| - | - |\n| raw | <img src="x" onerror="alert(1)"> |'
  const rendered = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkEmptyTableCells] }, markdown))
  assert.doesNotMatch(rendered, /<img/)
  assert.match(rendered, /&lt;img/)
})
