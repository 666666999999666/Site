import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import { codeBlockSource, rehypeCodeSource, remarkCodeSource, type CodeBlockSource } from "../lib/rehype-code-source"
import { normalizeContentForDisplay } from "../lib/content"

function readBlocks(markdown: string) {
  const blocks: CodeBlockSource[] = []
  const html = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkCodeSource],
    rehypePlugins: [rehypeCodeSource, [rehypeHighlight, { detect: true, ignoreMissing: true }]],
    components: {
      pre({ node, children }) {
        const block = codeBlockSource(node)
        assert.ok(block)
        blocks.push(block)
        return createElement("pre", null, children)
      },
    },
  }, normalizeContentForDisplay(markdown)))
  return { blocks, html }
}

test("copy source is literal Markdown code before highlighting, without a synthetic terminal newline", () => {
  const source = '\n\tconst greeting = "你好 world";  \n\nconsole.log(greeting);\n'
  const { blocks, html } = readBlocks("```javascript\n" + source + "\n```")
  assert.deepEqual(blocks, [{ source, language: "javascript" }])
  assert.match(html, /hljs-keyword/)
  assert.doesNotMatch(html, /data-reader-code-source|dataReaderCodeSource|\[object Object\]/)
})

test("unlabelled and indented code preserve blank lines, tabs, NBSP and trailing spaces", () => {
  const { blocks } = readBlocks("```\n\tfirst line  \n\nlast\n```\n\n    indented  \n    second\n")
  assert.deepEqual(blocks, [
    { source: "\tfirst line  \n\nlast", language: "" },
    { source: "indented  \nsecond", language: "" },
  ])
})

test("standalone legacy breaks do not rewrite literal code or multi-line inline code", () => {
  const markdown = "<br>\n\n```html\n<br>\n<br />\n```\n\n    <br>\n\n`start\n<br>\nend`\n\n<br />"
  assert.equal(normalizeContentForDisplay(markdown), "&nbsp;\n\n```html\n<br>\n<br />\n```\n\n    <br>\n\n`start\n<br>\nend`\n\n&nbsp;")
  assert.equal(readBlocks(markdown).blocks[0].source, "<br>\n<br />")
})

test("Mermaid receives its original literal source and language", () => {
  const source = 'graph TD\n  A["你好"] --> B["<br>"]'
  assert.deepEqual(readBlocks("```mermaid\n" + source + "\n```").blocks, [{ source, language: "mermaid" }])
})
