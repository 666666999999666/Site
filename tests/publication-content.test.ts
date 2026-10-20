import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import {
  getContentFormatLabel, getPostSummary, getReadingLabel, needsPublicationReview,
  scanPublicationContent, truncateSummary,
} from "../lib/publication-content"
import { validatePostCreate, validatePostUpdate } from "../lib/validation"

test("summaries prefer a readable independent excerpt and produce plain text", () => {
  assert.equal(getPostSummary({ title: "标题", excerpt: "**适合初学者**，了解 [方法](https://example.com)。", content: "其他正文" }), "适合初学者，了解 方法。")
  assert.equal(getPostSummary({ excerpt: "<script>alert(1)</script>\n\n正文 &amp; 说明\u0001", content: "备用" }), "正文 & 说明")
  assert.equal(getPostSummary({ excerpt: "1.00 1.00", content: "真正的正文。" }), "真正的正文。")
})

test("fallback summaries exclude images, numeric placeholders, code and a duplicated title", () => {
  const content = "# 本文标题\n\n![1.00](/uploads/one.png)\n\n1.00 1.00\n\n```python\nsecret = 123\n```\n\n先理解原理。\n\n再尝试方法。"
  assert.equal(getPostSummary({ title: "本文标题", content }), "先理解原理。 再尝试方法。")
  assert.equal(getPostSummary({ title: "图解说明", content: "![完整替代文本也不冒充摘要](image.png)" }), "《图解说明》：暂无文字摘要，请查看正文。")
  assert.equal(getPostSummary({ title: "代码参考", content: "```js\nalert('example')\n```" }), "《代码参考》：暂无文字摘要，请查看正文。")
  assert.equal(getPostSummary({ content: "![1.00][figure]\n\n[figure]: /uploads/one.png" }), "暂无文字摘要，请查看正文。")
})

test("inline code terms remain part of readable prose while standalone code blocks stay excluded", () => {
  assert.equal(getPostSummary({ content: "使用 `dataclass` 组织数据。\n\n```python\n@dataclass\nclass Example: pass\n```" }), "使用 dataclass 组织数据。")
  assert.equal(getPostSummary({ excerpt: "对比 `list` 和 `tuple` 的用途。" }), "对比 list 和 tuple 的用途。")
})

test("legacy article bodies share normalization while retaining readable block boundaries", () => {
  const content = JSON.stringify({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
    { type: "image", attrs: { src: "/uploads/a.png", alt: "1.00" } },
    { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
  ] })
  assert.equal(getPostSummary({ content }), "第一段 第二段")
  assert.equal(scanPublicationContent({ content }).warnings[0].code, "placeholder-image-alt")
})

test("summary truncation uses sentence boundaries where possible and preserves unicode", () => {
  assert.equal(truncateSummary("第一句很完整。第二句还很长，需要截断。", 14), "第一句很完整。")
  assert.equal(truncateSummary("😀😀😀😀", 3), "😀😀…")
  assert.equal(truncateSummary("abc", 0), "")
  assert.equal(truncateSummary("abc", 1), "…")
  assert.ok(Array.from(getPostSummary({ content: "说明文字".repeat(100) }, 50)).length <= 50)
})

test("reading labels report image-only article counts and support author overrides", () => {
  const content = Array.from({ length: 6 }, (_, index) => `![${index + 1}](/uploads/${index}.png)`).join("\n\n")
  assert.equal(getReadingLabel({ content, readTime: 1 }), "6 张图解")
  assert.equal(getContentFormatLabel({ content }), "图解")
  assert.equal(getReadingLabel({ content, readHint: "约 15 分钟，含练习" }), "约 15 分钟，含练习")
  assert.equal(getContentFormatLabel({ content, contentFormat: "STUDY_NOTE" }), "学习笔记")
  assert.equal(getReadingLabel({ content: "正文说明", readTime: 7 }), "7 分钟阅读")
  assert.equal(getContentFormatLabel({ content: "正文说明" }), null)
  assert.equal(getReadingLabel({ content: "说明\n\n![图](a.png)", contentFormat: "DIAGRAM" }), "1 张图解")
  assert.equal(getReadingLabel({ content: "说明", readTime: Number.NaN }), "1 分钟阅读")
})

test("code scans report exact normalized positions and context without modifying characters", () => {
  const content = "说明\r\n\r\n```python\r\nx = 1\r\n\u00a0print('a\u200bb') # intentional\r\n```\r\n"
  const review = scanPublicationContent({ content })
  assert.equal(review.positionSource, "normalized-markdown")
  assert.equal(review.totalWarnings, 2)
  assert.deepEqual(review.warnings.map(({ line, column, codePoint, codeBlock, language }) => ({ line, column, codePoint, codeBlock, language })), [
    { line: 5, column: 1, codePoint: "U+00A0", codeBlock: 1, language: "python" },
    { line: 5, column: 10, codePoint: "U+200B", codeBlock: 1, language: "python" },
  ])
  assert.match(review.warnings[0].context, /⟦U\+00A0⟧/u)
  assert.match(review.warnings[1].message, /字符串.*注释/u)
  assert.ok(content.includes("\u00a0print('a\u200bb')"))
  assert.equal(scanPublicationContent({ content: "自然文字中的 a\u00a0b 和 a\u200bb" }).totalWarnings, 0)
})

test("indented and blockquoted code is scanned with source positions", () => {
  assert.equal(scanPublicationContent({ content: "    x = '\u00a0'" }).warnings[0].column, 10)
  const review = scanPublicationContent({ content: "> ```py\n> x = '\u200b'\n> ```" })
  assert.equal(review.warnings[0].line, 2)
  assert.equal(review.warnings[0].column, 8)
})

test("numeric alt and intentional invisible strings are warnings rather than unconditional validation errors", () => {
  const content = "![1.00](one.png)\n\n```js\nconst nbsp = '\u00a0';\n```"
  const input = validatePostCreate({ title: "数字图表", content, status: "PUBLISHED" })
  assert.equal(input.content, content)
  const review = scanPublicationContent(input)
  assert.ok(review.warnings.some((warning) => warning.code === "placeholder-image-alt"))
  assert.ok(review.warnings.some((warning) => warning.code === "image-only-summary"))
  assert.ok(review.warnings.some((warning) => warning.code === "invisible-code-character"))
  assert.equal(scanPublicationContent({ content: "![完整说明](one.png)", excerpt: "解释这张图的方法。" }).totalWarnings, 0)
})

test("review checks bind to submitted text and skip drafts or unrelated published metadata", () => {
  const current = { title: "标题", excerpt: null, content: "![1.00](one.png)", status: "PUBLISHED" }
  assert.equal(needsPublicationReview(current, { ...current, excerpt: "", readHint: "6 张图解" }), false)
  assert.equal(needsPublicationReview(current, { ...current, status: "DRAFT" }), false)
  assert.equal(needsPublicationReview(current, { ...current, title: "新标题" }), true)
  assert.equal(needsPublicationReview({ ...current, status: "DRAFT" }, current), true)
  assert.equal(needsPublicationReview(null, current), true)
  const review = scanPublicationContent(current)
  assert.equal(review.reviewToken, scanPublicationContent({ ...current, title: " 标题 ", excerpt: "" }).reviewToken)
  assert.notEqual(review.reviewToken, scanPublicationContent({ ...current, content: current.content + "\n" }).reviewToken)
  assert.notEqual(review.reviewToken, scanPublicationContent({ ...current, excerpt: "独立说明" }).reviewToken)
})

test("warning collection is bounded while the total remains accurate", () => {
  const review = scanPublicationContent({ content: "```txt\n" + "\u200b".repeat(250) + "\n```" })
  assert.equal(review.totalWarnings, 250)
  assert.equal(review.warnings.length, 200)
  assert.equal(review.truncated, true)
})

test("reading metadata is nullable, bounded and strictly validated", () => {
  assert.deepEqual(validatePostUpdate({ contentFormat: null, readHint: "", publicationReviewToken: "publication-v1-0-0" }), {
    contentFormat: null, readHint: null, publicationReviewToken: "publication-v1-0-0",
  })
  assert.equal(validatePostUpdate({ contentFormat: "ESSAY", readHint: "  约 5 分钟  " }).readHint, "约 5 分钟")
  assert.throws(() => validatePostUpdate({ contentFormat: "unrecognized" }), /内容形式无效/)
  assert.throws(() => validatePostUpdate({ readHint: "字".repeat(121) }), /不能超过 120/)
  assert.throws(() => validatePostUpdate({ publicationReviewToken: true }), /必须是字符串/)
  assert.deepEqual(validatePostUpdate({ tags: ["AI、Python，工具", "Python"] }).tags, ["AI", "Python", "工具"])
})

test("the file-input scanner is dry-run only and leaves its source unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publication-review-test-"))
  try {
    const file = join(directory, "posts.json")
    const source = JSON.stringify([{ title: "合成图解", content: "![1.00](one.png)" }])
    await writeFile(file, source)
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-publication-content.ts", file], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.mode, "dry-run")
    assert.equal(output.writes, 0)
    assert.equal(output.reports[0].totalWarnings, 2)
    assert.equal(await readFile(file, "utf8"), source)
    const apply = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-publication-content.ts", "--apply", file], { encoding: "utf8" })
    assert.equal(apply.status, 1)
    assert.match(apply.stderr, /no apply\/write mode/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
