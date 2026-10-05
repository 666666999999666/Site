import assert from "node:assert/strict"
import test from "node:test"
import { ideaSummary } from "../lib/idea-summary"

const fence = String.fromCharCode(96).repeat(3)

const cases: [string, string, string][] = [
  ["Chinese plain text and soft line breaks", "中文想法。\n下一行。", "中文想法。 下一行。"],
  ["second and third level headings", "## 二级标题\n\n正文\n\n### 三级标题\n\n结束", "二级标题 正文 三级标题 结束"],
  ["inline formatting retains adjoining characters", "甲**重点**乙，*强调*与~~删除线~~。", "甲重点乙，强调与删除线。"],
  ["list items and paragraphs stay separated", "开头\n\n- 第一项\n  - 内层\n- 第二项\n\n1. 第三项\n2. 第四项\n\n结尾", "开头 第一项 内层 第二项 第三项 第四项 结尾"],
  ["descriptive and reference links omit targets", "[资料 **说明**](https://example.test/long/path) 和 [参考][ref]\n\n[ref]: https://example.test/reference", "资料 说明 和 参考"],
  ["inline code preserves its characters", "运行 `a_b # <value>` 后继续。", "运行 a_b # <value> 后继续。"],
  ["fenced and indented code are omitted", ["说明", "", fence + "bash", "echo secret_code", fence, "", "    python_code", "", "结论"].join("\n"), "说明 结论"],
  ["images and their targets never dominate summaries", "甲![图片描述](/uploads/long-file-name.png)乙\n\n![引用图片][image]\n\n[image]: https://example.test/image.png\n\n结尾", "甲 乙 结尾"],
  ["multiple paragraphs and hard breaks stay separated", "第一段。  \n第二行。\n\n第二段。\n\n> 引用文字", "第一段。 第二行。 第二段。 引用文字"],
  ["normal symbols are preserved", "C#，issue #42，file_name，a_b_c，2 < 3，5 > 4，<变量>，\\# 字面符号", "C#，issue #42，file_name，a_b_c，2 < 3，5 > 4，<变量>，# 字面符号"],
  ["GFM task lists and tables stay readable", "- [x] 已完成\n- [ ] 待办\n\n| 项目 | 结果 |\n| --- | --- |\n| 甲 | 乙 |", "已完成 待办 项目 结果 甲 乙"],
  ["HTML and dangerous link text stay inert", '<script>alert(1)</script>\n\n[说明](javascript:alert(1))', '<script>alert(1)</script> 说明'],
]

for (const [name, markdown, expected] of cases) {
  test("Idea summary: " + name, () => assert.equal(ideaSummary(markdown), expected))
}

test("Idea summary truncates plain text after parsing, by Unicode code points", () => {
  const text = "中文😀".repeat(40)
  assert.equal(ideaSummary("## **[" + text + "](https://example.test/" + "path".repeat(100) + ")**"), [...text].slice(0, 100).join("") + "…")
  assert.equal(ideaSummary("中".repeat(100)), "中".repeat(100))
  assert.equal(ideaSummary("中".repeat(101)), "中".repeat(100) + "…")
})

test("Idea summary handles empty, code-only and image-only bodies", () => {
  for (const markdown of ["", " \n\t", fence + "python\nprint(42)\n" + fence, "![图片](/uploads/example.png)", "---"]) {
    assert.equal(ideaSummary(markdown), "")
  }
})
