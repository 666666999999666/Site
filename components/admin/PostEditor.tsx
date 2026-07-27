"use client"

import { useEffect, useRef } from "react"
import { Editor } from "bytemd"
import gfm from "@bytemd/plugin-gfm"
import math from "@bytemd/plugin-math"
import mermaid from "@bytemd/plugin-mermaid"
import "bytemd/dist/index.css"
import "highlight.js/styles/github.css"
import "katex/dist/katex.min.css"

/**
 * ByteMD 插件配置：GFM（表格/脚注/任务列表/删除线）+ 数学公式 + Mermaid 流程图
 */
const plugins = [gfm(), math(), mermaid()]

/**
 * ByteMD 图片上传：对接现有 /api/upload 接口
 * bytemd 期望 uploadFile 返回 URL 字符串，会自动插入 ![](url)
 */
async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/upload", {
    method: "POST",
    body: fd,
  })
  if (!res.ok) {
    throw new Error("图片上传失败")
  }
  const { url } = await res.json()
  return url
}

/**
 * ByteMD 是 Svelte 组件，TypeScript 类型定义（SvelteComponentTyped）的构造函数签名不准确
 * 这里手动声明构造函数和实例类型，通过类型断言绕过类型检查
 */
type ByteMDEditorInstance = {
  $on(event: "change", cb: (e: { detail: { value: string } }) => void): void
  $set(props: { value: string }): void
  $destroy(): void
}

type ByteMDEditorCtor = new (opts: {
  target: HTMLElement
  props: {
    value: string
    plugins: unknown[]
    uploadFile: (file: File) => Promise<string>
  }
}) => ByteMDEditorInstance

const ByteMDEditor = Editor as unknown as ByteMDEditorCtor

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
 * Markdown 编辑器（基于 ByteMD，自己写 React 19 wrapper 避免依赖 @bytemd/react）
 *
 * 接口签名与原 Tiptap 版本一致：
 *   value: string          // 现在是 Markdown 文本（之前是 Tiptap JSON 字符串）
 *   onChange: (v: string)  // 现在回调的是 Markdown 文本
 */
export function PostEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ByteMDEditorInstance | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 将 Tiptap JSON 自动转换为 Markdown
  const normalizedValue = normalizeTiptapToMarkdown(value || "")

  // 当前编辑器内容，避免外部 value 变化时回环更新
  const currentValueRef = useRef<string>(normalizedValue)

  useEffect(() => {
    if (!containerRef.current) {
      console.error("[PostEditor] containerRef.current is null")
      return
    }

    // 防止 React StrictMode 双重挂载时重复初始化
    if (editorRef.current) {
      console.log("[PostEditor] editor already exists, skip")
      return
    }

    console.log("[PostEditor] initializing bytemd, container:", containerRef.current)

    try {
      const editor = new ByteMDEditor({
        target: containerRef.current,
        props: {
          value: normalizedValue || "",
          plugins,
          uploadFile,
        },
      })

      console.log("[PostEditor] bytemd created successfully:", editor)

      editor.$on("change", (e) => {
        const newValue = e.detail.value
        currentValueRef.current = newValue
        onChangeRef.current(newValue)
        // 同步回 editor，避免内部状态不一致
        editor.$set({ value: newValue })
      })

      editorRef.current = editor
    } catch (err) {
      console.error("[PostEditor] bytemd init failed:", err)
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.$destroy()
        editorRef.current = null
      }
    }
    // 仅初始化一次，value 通过下面的 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化时同步到编辑器（避免回环）
  useEffect(() => {
    if (editorRef.current && normalizedValue !== currentValueRef.current) {
      currentValueRef.current = normalizedValue
      editorRef.current.$set({ value: normalizedValue || "" })
    }
  }, [normalizedValue])

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card bytemd-wrapper">
      <div ref={containerRef} />
    </div>
  )
}
