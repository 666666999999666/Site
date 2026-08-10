import assert from "node:assert/strict"
import test from "node:test"
import {
  markdownLocalImageReferences,
  parseMarkdownDraft,
  rewriteMarkdownImageReferences,
} from "../lib/markdown-import"

test("parses frontmatter while preserving Markdown, mermaid, and KaTeX", () => {
  const raw = [
    "---",
    "title: Agent 导入测试",
    "description: 原始摘要",
    "tags:",
    "  - MCP",
    "  - Markdown",
    "custom:",
    "  reviewed: false",
    "---",
    "",
    "正文 $x^2$",
    "",
    "```mermaid",
    "graph TD",
    "  A --> B",
    "```",
  ].join("\n")
  const draft = parseMarkdownDraft("draft.md", raw)

  assert.equal(draft.title, "Agent 导入测试")
  assert.equal(draft.excerpt, "原始摘要")
  assert.deepEqual(draft.tags, ["MCP", "Markdown"])
  assert.deepEqual(draft.draftMetadata?.custom, { reviewed: false })
  assert.match(draft.content, /正文 \$x\^2\$/)
  assert.match(draft.content, /```mermaid\ngraph TD\n  A --> B\n```/)
  assert.doesNotMatch(draft.content, /^---/)
})

test("rewrites only parsed image destinations without touching code examples", () => {
  const markdown = [
    "![实际图片](./assets/a.png)",
    "",
    "```markdown",
    "![示例](./assets/a.png)",
    "```",
    "",
    "公式 $a_(b)$",
  ].join("\n")
  const rewritten = rewriteMarkdownImageReferences(
    markdown,
    new Map([["./assets/a.png", "/uploads/imported.png"]])
  )

  assert.match(rewritten, /^!\[实际图片\]\(\/uploads\/imported\.png\)/)
  assert.match(rewritten, /```markdown\n!\[示例\]\(\.\/assets\/a\.png\)\n```/)
  assert.match(rewritten, /公式 \$a_\(b\)\$/)
})

test("collects only local image references for remote upload", () => {
  const draft = parseMarkdownDraft("draft.md", [
    "![local](./assets/a.png)",
    "![remote](https://example.com/a.png)",
    "![stored](/uploads/existing.png)",
  ].join("\n"))
  assert.deepEqual(markdownLocalImageReferences(draft), ["./assets/a.png"])
})

test("rejects unsafe image protocols and cross-platform absolute paths", () => {
  for (const reference of [
    "file:///etc/passwd",
    "data:image/png;base64,AAAA",
    "/etc/passwd",
    "C:/secret.png",
    "C:\\secret.png",
    "\\\\server\\share\\secret.png",
  ]) {
    const draft = parseMarkdownDraft("draft.md", `![unsafe](${reference})`)
    assert.throws(() => markdownLocalImageReferences(draft), /不允许|相对路径/)
  }
})
