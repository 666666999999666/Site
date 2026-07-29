import assert from "node:assert/strict"
import test from "node:test"
import {
  extractHeadings,
  extractPlainText,
  extractUploadUrls,
  isTiptapJson,
  normalizeContent,
  tiptapToMarkdown,
} from "../lib/content"

const legacyDocument = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "重复标题" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "链接",
          marks: [
            { type: "bold" },
            { type: "italic" },
            { type: "link", attrs: { href: "https://example.com/a b" } },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "第三项" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "第四项" }] }],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "重复标题" }],
    },
    {
      type: "image",
      attrs: { src: "/uploads/example.webp", alt: "示例" },
    },
  ],
})

test("converts Tiptap marks, links, ordered list numbers, and images", () => {
  const markdown = tiptapToMarkdown(legacyDocument)
  assert.match(markdown, /\[\*\*\*链接\*\*\*\]\(https:\/\/example\.com\/a%20b\)/)
  assert.match(markdown, /3\. 第三项/)
  assert.match(markdown, /4\. 第四项/)
  assert.match(markdown, /!\[示例\]\(\/uploads\/example\.webp\)/)
  assert.equal(isTiptapJson(markdown), false)
})

test("extracts Markdown and legacy headings with stable duplicate ids", () => {
  const legacy = extractHeadings(legacyDocument)
  assert.deepEqual(legacy.map(({ id }) => id), ["重复标题", "重复标题-1"])

  const markdown = [
    "## Alpha",
    "```md",
    "## Not a heading",
    "```",
    "### Alpha",
    "#### 中文 标题",
  ].join("\n")
  assert.deepEqual(
    extractHeadings(markdown).map(({ id, level }) => ({ id, level })),
    [
      { id: "alpha", level: 2 },
      { id: "alpha-1", level: 3 },
      { id: "中文-标题", level: 4 },
    ]
  )
})

test("preserves readable text and finds referenced uploads", () => {
  assert.match(extractPlainText(legacyDocument), /重复标题/)
  assert.deepEqual(extractUploadUrls(legacyDocument), ["/uploads/example.webp"])
})

test("removes standalone HTML break tags without enabling raw HTML", () => {
  const markdown = "before\n\n<br />\n\nafter <br /> inline"
  assert.equal(normalizeContent(markdown), "before\n\n\n\nafter <br /> inline")
})
