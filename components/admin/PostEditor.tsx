"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Image as ImageIcon, Minus, Link2
} from "lucide-react"

export function PostEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (json: string) => void
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "开始写点什么…" }),
    ],
    content: value ? safeParse(value) : "",
    onUpdate: ({ editor }) => {
      onChangeRef.current(JSON.stringify(editor.getJSON()))
    },
    editorProps: {
      attributes: {
        class: "prose prose-neutral dark:prose-invert max-w-none min-h-[400px] p-4 focus:outline-none font-mono text-sm",
      },
    },
  })

  useEffect(() => {
    if (editor && value && !editor.isDestroyed) {
      const current = JSON.stringify(editor.getJSON())
      if (current !== value) {
        editor.commands.setContent(safeParse(value))
      }
    }
  }, [value, editor])

  if (!editor) return null

  async function insertImage() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      if (res.ok) {
        const { url } = await res.json()
        editor?.chain().focus().setImage({ src: url }).run()
      }
    }
    input.click()
  }

  function insertLink() {
    const url = window.prompt("链接地址")
    if (url) editor?.chain().focus().setLink({ href: url }).run()
  }

  const btn = "h-8 w-8 p-0 text-muted-foreground hover:text-foreground"

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
      <div className="sticky top-0 z-10 flex flex-wrap gap-1 p-2 border-b border-border/50 bg-card">
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="加粗">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体">
          <Italic className="h-4 w-4" />
        </Button>
        <Sep />
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="标题1">
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="标题2">
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="标题3">
          <Heading3 className="h-4 w-4" />
        </Button>
        <Sep />
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="无序列表">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用">
          <Quote className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-label="代码块">
          <Code className="h-4 w-4" />
        </Button>
        <Sep />
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={insertLink} aria-label="链接">
          <Link2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={insertImage} aria-label="图片">
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={btn} onClick={() => editor.chain().focus().setHorizontalRule().run()} aria-label="分割线">
          <Minus className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function Sep() {
  return <span className="w-px h-6 bg-border/50 mx-1 self-center" />
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return s }
}
