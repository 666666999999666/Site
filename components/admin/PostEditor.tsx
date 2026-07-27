"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { Crepe } from "@milkdown/crepe"
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener"
import { editorViewCtx, parserCtx } from "@milkdown/kit/core"
import { Slice } from "@milkdown/kit/prose/model"
import { Selection } from "@milkdown/kit/prose/state"
import "@milkdown/crepe/theme/common/style.css"
import "@milkdown/crepe/theme/frame.css"

/**
 * 检测内容是否为 Tiptap JSON 格式，如果是则转换为 Markdown
 * 旧文章可能存储的是 Tiptap JSON，新文章是 Markdown
 */
function normalizeTiptapToMarkdown(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  if (trimmed.startsWith('{"type":"doc"') || trimmed.startsWith('{"type": "doc"')) {
    try {
      const json = JSON.parse(trimmed)
      const lines: string[] = []

      function walk(node: Record<string, unknown>) {
        if (node.type === "text" && typeof node.text === "string") {
          if (Array.isArray(node.marks)) {
            for (const mark of node.marks as Record<string, unknown>[]) {
              if (mark.type === "bold") { lines.push(`**${node.text}**`); return }
              if (mark.type === "italic") { lines.push(`*${node.text}*`); return }
              if (mark.type === "code") { lines.push(`\`${node.text}\``); return }
            }
          }
          lines.push(node.text)
        } else if (node.type === "hardBreak") {
          lines.push("\n")
        } else if (node.type === "paragraph") {
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
          lines.push("\n")
        } else if (node.type === "heading") {
          const level = (node.attrs as { level?: number })?.level ?? 2
          lines.push("#".repeat(level) + " ")
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
          lines.push("\n")
        } else if (node.type === "bulletList" || node.type === "orderedList") {
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
        } else if (node.type === "listItem") {
          lines.push("- ")
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
        } else if (node.type === "codeBlock") {
          const lang = (node.attrs as { language?: string })?.language || ""
          lines.push(`\n\`\`\`${lang}\n`)
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
          lines.push("\n```\n")
        } else if (node.type === "blockquote") {
          lines.push("> ")
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
          lines.push("\n")
        } else if (node.type === "horizontalRule") {
          lines.push("\n---\n")
        } else if (node.type === "image") {
          const attrs = node.attrs as { src?: string; alt?: string } | undefined
          lines.push(`\n![${attrs?.alt || ""}](${attrs?.src || ""})\n`)
        } else {
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
        }
      }

      walk(json)
      return lines.join("").replace(/\n{3,}/g, "\n\n").trim()
    } catch {
      return raw
    }
  }

  return raw
}

/**
 * Markdown 所见即所得编辑器（基于 Milkdown + Crepe）
 *
 * 接口签名与原版本一致：
 *   value: string          // Markdown 文本
 *   onChange: (v: string)  // 回调 Markdown 文本
 */
export function PostEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const onChangeRef = useRef(onChange)
  const loadingRef = useRef(false)

  // 将 Tiptap JSON 自动转换为 Markdown
  const normalizedValue = normalizeTiptapToMarkdown(value || "")

  // 当前编辑器内容，避免外部 value 变化时回环更新
  const currentValueRef = useRef<string>(normalizedValue)

  // 每次 render 同步 onChange 回调到 ref，避免渲染阶段直接写 ref
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // 初始化 Crepe 编辑器（仅运行一次）
  useLayoutEffect(() => {
    if (!divRef.current) return
    if (loadingRef.current) return
    loadingRef.current = true

    const crepe = new Crepe({
      root: divRef.current,
      defaultValue: normalizedValue || "",
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", {
              method: "POST",
              body: fd,
            })
            if (!res.ok) throw new Error("图片上传失败")
            const { url } = await res.json()
            return url
          },
        },
      },
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          currentValueRef.current = markdown
          onChangeRef.current(markdown)
        })
      })
      .use(listener)

    crepe.create().then(() => {
      crepeRef.current = crepe
      loadingRef.current = false
    })

    return () => {
      if (crepeRef.current) {
        crepeRef.current.destroy()
        crepeRef.current = null
      }
      loadingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化时同步到编辑器（避免回环）
  useLayoutEffect(() => {
    if (crepeRef.current && normalizedValue !== currentValueRef.current) {
      currentValueRef.current = normalizedValue
      crepeRef.current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const parser = ctx.get(parserCtx)
        const doc = parser(normalizedValue || "")
        if (!doc) return
        const state = view.state
        const selection = state.selection
        const { from } = selection
        let tr = state.tr
        tr = tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
        const docSize = doc.content.size
        const safeFrom = Math.min(from, docSize - 2)
        tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
        view.dispatch(tr)
      })
    }
  }, [normalizedValue])

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
      <div ref={divRef} className="milkdown-editor-wrapper" style={{ minHeight: "500px" }} />
    </div>
  )
}
