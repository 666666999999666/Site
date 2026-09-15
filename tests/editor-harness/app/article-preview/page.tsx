import { ArticlePublicationPreview } from "@/components/admin/ArticlePublicationPreview"

const previewMarkdown = [
  "## 发布标题",
  "",
  "正文包含 **粗体** 和 `inline_code`。",
  "",
  "| 项目 | 结果 |",
  "| --- | --- |",
  "| 预览 | 一致 |",
  "",
  "公式：$a^2 + b^2 = c^2$",
  "",
  "## 发布标题",
  "",
  "重复标题也必须得到稳定锚点。",
].join("\n")

export default function ArticlePreviewHarnessPage() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <ArticlePublicationPreview content={previewMarkdown} />
    </main>
  )
}
