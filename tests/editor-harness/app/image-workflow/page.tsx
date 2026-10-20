"use client"

import { useRef, useState } from "react"
import { ArticlePublicationPreview } from "@/components/admin/ArticlePublicationPreview"
import { PostEditor, type PostEditorHandle } from "@/components/admin/PostEditor"

const initial = '图片正文\n\n![普通图片的替代文本](/test-image-landscape.svg "普通图片说明")\n\n![长图的替代文本](/test-image-long.svg "长图说明")\n\n正文结尾'
const imageOnly = '![唯一图片](/test-image-landscape.svg "单图说明 {qz-width=600}")'

export default function ImageWorkflowHarness() {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [generation, setGeneration] = useState(0)
  const [preview, setPreview] = useState(false)
  const editor = useRef<PostEditorHandle>(null)
  return (
    <main className="admin-document min-w-0">
      <div className="sticky top-0 z-50 flex flex-wrap gap-3 bg-background p-3">
        <button onClick={() => { const next = editor.current!.getMarkdownForSave(); setValue(next); setSaved(next) }}>保存正文</button>
        <button onClick={() => { setValue(saved); setGeneration((key) => key + 1); setPreview(false) }}>重新打开</button>
        <button onClick={() => setValue(saved)}>取消正文修改</button>
        <button onClick={() => { setValue(imageOnly); setSaved(imageOnly) }}>切换为单图文档</button>
        <button onClick={() => { setValue(editor.current!.getMarkdown()); setPreview(!preview) }}>{preview ? "继续编辑" : "预览正文"}</button>
      </div>
      <details className="my-3 rounded border border-border p-3">
        <summary>查看当前 Markdown</summary>
        <pre data-testid="markdown-output" className="max-h-60 overflow-auto whitespace-pre-wrap">{value}</pre>
      </details>
      <details className="my-3 rounded border border-border p-3">
        <summary>查看已保存 Markdown</summary>
        <pre data-testid="saved-markdown" className="max-h-60 overflow-auto whitespace-pre-wrap">{saved}</pre>
      </details>
      <div hidden={preview}>
        <PostEditor key={generation} value={value} onChange={setValue} onDocumentChange={setValue} controlRef={editor} />
      </div>
      {preview && <ArticlePublicationPreview content={value} />}
    </main>
  )
}
