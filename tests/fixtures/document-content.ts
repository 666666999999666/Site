// 全部为人工构造的测试内容，不来自线上私人笔记。
const fence = String.fromCharCode(96).repeat(3)
export const ideaTestContent = [
  "首行保留", "第二行保留", "",
  "一、普通文字标签", "", "这一行没有标题标记。", "",
  "## 标准标题", "", "### 小节", "", "- 列表甲", "- 列表乙", "",
  fence + "bash", "printf 'hello'", "echo " + "long_code_".repeat(32), fence, "",
  fence + "python", "def example():", "    return 42", fence, "",
  "来源：https://example.test/" + "reference/".repeat(30), "",
  '<script>window.__documentXss = true</script>',
  '<img src=x onerror="window.__documentXss = true">',
  "",
  "[危险链接](javascript:alert(1))",
].join("\n")

export const postTestContent = [
  "正文开头。", "", "## 标准标题", "", "普通段落 **粗体** 和行内代码。", "",
  fence + "python", "def example():", "    return " + "long_code_".repeat(30), fence, "",
  "| 项目 | 结果 |", "| --- | --- |", "| 表格 | 可读 |", "",
  "![测试图片](/test-document-image.svg)", "",
  ...Array.from({ length: 28 }, (_, index) => ["段落 " + (index + 1) + "：这是用于验证长文阅读宽度、滚动和模式切换的人工测试文字。".repeat(4), ""]).flat(),
].join("\n")
