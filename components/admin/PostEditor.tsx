"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { Crepe } from "@milkdown/crepe"
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener"
import { editorViewCtx, parserCtx } from "@milkdown/kit/core"
import { Slice } from "@milkdown/kit/prose/model"
import { Selection } from "@milkdown/kit/prose/state"
import "@milkdown/crepe/theme/common/style.css"
import "@milkdown/crepe/theme/frame.css"
import { normalizeContent } from "@/lib/content"

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
  onUpload,
}: {
  value: string
  onChange: (value: string) => void
  onUpload?: (url: string) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const onChangeRef = useRef(onChange)
  const onUploadRef = useRef(onUpload)
  const loadingRef = useRef(false)

  // 将 Tiptap JSON 自动转换为 Markdown
  const normalizedValue = normalizeContent(value || "")

  // 当前编辑器内容，避免外部 value 变化时回环更新
  const currentValueRef = useRef<string>(normalizedValue)

  // 每次 render 同步 onChange 回调到 ref，避免渲染阶段直接写 ref
  useEffect(() => {
    onChangeRef.current = onChange
    onUploadRef.current = onUpload
  }, [onChange, onUpload])

  // 初始化 Crepe 编辑器（仅运行一次）
  useLayoutEffect(() => {
    if (!divRef.current) return
    if (loadingRef.current) return
    loadingRef.current = true
    let cancelled = false

    const crepe = new Crepe({
      root: divRef.current,
      defaultValue: normalizedValue || "",
      featureConfigs: {
        [Crepe.Feature.Cursor]: {
          virtual: false,
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", {
              method: "POST",
              body: fd,
            })
            const payload = await res.json().catch(() => ({})) as { url?: string; error?: string }
            if (!res.ok || !payload.url) throw new Error(payload.error || "图片上传失败")
            const url = payload.url
            onUploadRef.current?.(url)
            return url
          },
        },
        [Crepe.Feature.Placeholder]: {
          text: "开始写正文，输入 / 可打开命令菜单",
          mode: "doc",
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
      if (cancelled) {
        void crepe.destroy()
        return
      }
      crepeRef.current = crepe
      loadingRef.current = false
    }).catch((error) => {
      loadingRef.current = false
      console.error("[MilkdownCreateFailed]", error)
    })

    return () => {
      cancelled = true
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
