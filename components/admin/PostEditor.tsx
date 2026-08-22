"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Crepe } from "@milkdown/crepe"
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener"
import { commandsCtx, editorViewCtx, parserCtx } from "@milkdown/kit/core"
import { Slice } from "@milkdown/kit/prose/model"
import { Selection } from "@milkdown/kit/prose/state"
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark"
import { insertTableCommand } from "@milkdown/kit/preset/gfm"
import { callCommand } from "@milkdown/kit/utils"
import "@milkdown/crepe/theme/common/style.css"
import "@milkdown/crepe/theme/frame.css"
import { normalizeContent } from "@/lib/content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const topBarLabels = [
  "加粗",
  "斜体",
  "删除线",
  "行内代码",
  "无序列表",
  "有序列表",
  "任务列表",
  "插入链接",
  "插入图片",
  "插入表格",
  "代码块",
  "数学公式",
  "引用",
  "分隔线",
]

const inlineToolbarLabels = ["加粗", "斜体", "删除线", "行内代码", "数学公式", "插入链接"]

function labelControl(element: Element, label: string) {
  element.setAttribute("aria-label", label)
  element.setAttribute("title", label)
  if (element instanceof HTMLButtonElement) element.type = "button"
}

function enhanceEditorControls(root: HTMLElement) {
  const headingButton = root.querySelector(".top-bar-heading-button")
  if (headingButton) labelControl(headingButton, "选择段落样式")

  root.querySelectorAll(".milkdown-top-bar .top-bar-item").forEach((element, index) => {
    const label = topBarLabels[index]
    if (label) labelControl(element, label)
    if (label === "插入表格") element.setAttribute("data-editor-action", "insert-table")
  })

  root.querySelectorAll(".milkdown-toolbar .toolbar-item").forEach((element, index) => {
    const label = inlineToolbarLabels[index]
    if (label) labelControl(element, label)
  })

  root.querySelectorAll(".milkdown-block-handle .operation-item").forEach((element, index) => {
    labelControl(element, index === 0 ? "在下方插入内容" : "选择当前内容块，可拖拽排序")
    if (!(element instanceof HTMLElement)) return
    element.setAttribute("role", "button")
    element.tabIndex = 0
    if (element.dataset.keyboardControl === "true") return
    element.dataset.keyboardControl = "true"
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      if (index === 0) {
        const rect = element.getBoundingClientRect()
        const pointerEvent = {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }
        element.dispatchEvent(new PointerEvent("pointerdown", pointerEvent))
        element.dispatchEvent(new PointerEvent("pointerup", pointerEvent))
        return
      }
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    })
  })

  root.querySelectorAll("button").forEach((button) => {
    button.type = "button"
  })
}

function TableInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (rows: number, columns: number) => void
}) {
  const [rows, setRows] = useState(3)
  const [columns, setColumns] = useState(3)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>插入表格</DialogTitle>
          <DialogDescription>先选择表格大小。行数包含第一行表头，插入后仍可继续增删行列。</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="editor-table-rows">行数（含表头）</Label>
            <select
              id="editor-table-rows"
              value={rows}
              onChange={(event) => setRows(Number(event.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Array.from({ length: 19 }, (_, index) => index + 2).map((count) => (
                <option key={count} value={count}>{count} 行</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-table-columns">列数</Label>
            <select
              id="editor-table-columns"
              value={columns}
              onChange={(event) => setColumns(Number(event.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count} 列</option>
              ))}
            </select>
          </div>
        </div>

        <p className="rounded-md bg-muted px-3 py-2 text-center text-sm font-medium">
          将插入 {rows} 行 × {columns} 列
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={() => onInsert(rows, columns)}>
            插入 {rows}×{columns} 表格
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const tableDialogTimerRef = useRef<number | null>(null)
  const [tableDialogOpen, setTableDialogOpen] = useState(false)

  function requestTableInsertion() {
    if (tableDialogTimerRef.current !== null) window.clearTimeout(tableDialogTimerRef.current)
    tableDialogTimerRef.current = window.setTimeout(() => {
      tableDialogTimerRef.current = null
      setTableDialogOpen(true)
    }, 0)
  }

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
    const controlObserver = new MutationObserver(() => {
      if (divRef.current) enhanceEditorControls(divRef.current)
    })
    controlObserver.observe(divRef.current, { childList: true, subtree: true })

    const crepe = new Crepe({
      root: divRef.current,
      defaultValue: normalizedValue || "",
      features: {
        [Crepe.Feature.TopBar]: true,
      },
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
        [Crepe.Feature.TopBar]: {
          headingOptions: [
            { label: "正文", level: null },
            { label: "二级标题", level: 2 },
            { label: "三级标题", level: 3 },
            { label: "四级标题", level: 4 },
          ],
          buildTopBar: (builder) => {
            const tableItem = builder
              .getGroup("insert")
              .group.items.find((item) => item.key === "table")
            if (tableItem) tableItem.onRun = () => {}
          },
        },
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
            const tableItem = builder
              .getGroup("advanced")
              .group.items.find((item) => item.key === "table")
            if (tableItem) {
              tableItem.onRun = (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
                requestTableInsertion()
              }
            }
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
      if (cancelled) {
        void crepe.destroy()
        return
      }
      crepeRef.current = crepe
      if (divRef.current) enhanceEditorControls(divRef.current)
      loadingRef.current = false
    }).catch((error) => {
      loadingRef.current = false
      console.error("[MilkdownCreateFailed]", error)
    })

    return () => {
      cancelled = true
      controlObserver.disconnect()
      if (tableDialogTimerRef.current !== null) {
        window.clearTimeout(tableDialogTimerRef.current)
        tableDialogTimerRef.current = null
      }
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

  function interceptTableKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('[data-editor-action="insert-table"]')) return
    event.preventDefault()
    event.stopPropagation()
    requestTableInsertion()
  }

  function interceptTablePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('[data-editor-action="insert-table"]')) return
    requestTableInsertion()
  }

  function insertSelectedTable(rows: number, columns: number) {
    const crepe = crepeRef.current
    if (!crepe) return
    const inserted = crepe.editor.action(callCommand(insertTableCommand.key, {
      row: rows,
      col: columns,
    }))
    if (!inserted) return
    window.setTimeout(() => {
      setTableDialogOpen(false)
      requestAnimationFrame(() => {
        crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus())
      })
    }, 50)
  }

  return (
    <>
      <div
        className="post-editor-shell rounded-lg border border-border/50 bg-card"
        onKeyDownCapture={interceptTableKeyboard}
        onPointerUpCapture={interceptTablePointerUp}
      >
        <div ref={divRef} className="milkdown-editor-wrapper" style={{ minHeight: "500px" }} />
      </div>

      <TableInsertDialog
        open={tableDialogOpen}
        onOpenChange={setTableDialogOpen}
        onInsert={insertSelectedTable}
      />
    </>
  )
}
