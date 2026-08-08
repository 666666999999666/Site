import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  parseMarkdownDraft,
  prepareMarkdownImport,
  rewriteMarkdownImageReferences,
} from "../lib/markdown-import"

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

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

test("prepares sandboxed Markdown without storing the article body in approval payload", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qz-mcp-markdown-"))
  const assets = path.join(root, "assets")
  await mkdir(assets)
  await writeFile(path.join(assets, "cover.png"), onePixelPng)
  await writeFile(path.join(root, "draft.md"), [
    "---",
    "title: 本地草稿",
    "cover: ./assets/cover.png",
    "---",
    "",
    "用户写的正文",
    "",
    "![封面](./assets/cover.png)",
  ].join("\n"))

  const prepared = await prepareMarkdownImport("draft.md", {
    markdownRoot: root,
    imageRoot: root,
  })
  assert.equal(prepared.summary.title, "本地草稿")
  assert.equal(prepared.summary.imageCount, 1)
  assert.equal(prepared.payload.images.length, 1)
  assert.doesNotMatch(JSON.stringify(prepared.payload), /用户写的正文/)
})

test("rejects Markdown and image traversal outside configured roots", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "qz-mcp-traversal-"))
  const root = path.join(parent, "allowed")
  await mkdir(root)
  await writeFile(path.join(parent, "outside.md"), "# outside")
  await writeFile(path.join(parent, "outside.png"), onePixelPng)
  await writeFile(path.join(root, "draft.md"), "![escape](../outside.png)")

  await assert.rejects(
    prepareMarkdownImport("../outside.md", { markdownRoot: root, imageRoot: root }),
    /超出允许目录/
  )
  await assert.rejects(
    prepareMarkdownImport("draft.md", { markdownRoot: root, imageRoot: root }),
    /超出允许目录/
  )
})
