import assert from "node:assert/strict"
import test from "node:test"
import { getContentFormatLabel, getPostPresentation, getPostSummary, getReadingLabel, scanPublicationContent } from "../lib/publication-content"

test("automatic body summaries omit block and inline math while keeping surrounding prose separated", () => {
  const content = "公式前的说明。\n\n$$\n\\frac{1}{\\sqrt{x^2 + 1}}\n$$\n\n公式后继续解释。行内$\\alpha$公式。"
  assert.equal(getPostSummary({ content }), "公式前的说明。 公式后继续解释。行内 公式。")
  assert.equal(getPostPresentation({ content }).summary, getPostSummary({ content }))
})

test("formula-only bodies use the existing neutral fallback", () => {
  assert.equal(getPostSummary({ title: "公式说明", content: "$$\n\\frac{1}{x}\n$$\n\n$\\alpha$" }), "《公式说明》：暂无文字摘要，请查看正文。")
})

test("manual excerpts and literal currency/code examples keep their prior plain text behavior", () => {
  assert.equal(getPostSummary({ excerpt: "人工保留 $\\alpha$ 作为说明。", content: "$x$" }), "人工保留 $\\alpha$ 作为说明。")
  assert.equal(getPostSummary({ content: "单价 $5，金额没有结束分隔符。" }), "单价 $5，金额没有结束分隔符。")
  assert.equal(getPostSummary({ content: "转义货币 \\$10 与 \\$20。" }), "转义货币 $10 与 $20。")
  assert.equal(getPostSummary({ content: "使用 `$\\alpha$` 示例。\n\n```tex\n$\\frac{1}{2}$\n```" }), "使用 $\\alpha$ 示例。")
})

test("math parsing follows renderer syntax inside GFM cells without changing ordinary content", () => {
  const content = "| 标题 | 说明 |\n| - | - |\n| 变量 $x$ | 使用 $\\beta$ 方法 |\n\n普通正文不变。"
  assert.equal(getPostSummary({ content }), "标题 说明 变量 使用 方法 普通正文不变。")
  assert.equal(getPostPresentation({ content: "普通正文。" }).summary, "普通正文。")
})

test("summary filtering does not change reading/format/review classification or source bytes", () => {
  const content = "![完整图示](/one.png)\n\n$$\n\\alpha\n$$"
  const post = Object.freeze({ title: "示意", content })
  const presentation = getPostPresentation(post)
  assert.equal(presentation.summary, "《示意》：暂无文字摘要，请查看正文。")
  assert.equal(presentation.readingLabel, "1 分钟阅读")
  assert.equal(presentation.contentFormatLabel, null)
  assert.equal(getReadingLabel(post), "1 分钟阅读")
  assert.equal(getContentFormatLabel(post), null)
  assert.equal(scanPublicationContent(post).totalWarnings, 0)
  assert.equal(post.content, content)
})

test("legacy Tiptap Unicode-escaped math delimiters are recognized after normalization", () => {
  const content = String.raw`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"公式前\u0024\\alpha\u0024公式后。"}]}]}`
  assert.equal(content.includes("$"), false)
  const post = Object.freeze({ content })
  assert.equal(getPostSummary(post), "公式前 公式后。")
  assert.equal(getPostPresentation(post).summary, "公式前 公式后。")
  assert.equal(post.content, content)
})
