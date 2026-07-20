"use client"

import { useEffect, useState } from "react"
import { generateHTML } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { type JSONContent } from "@tiptap/core"

const extensions = [StarterKit, Image]

export function PostContent({ content }: { content: string }) {
  const [html, setHtml] = useState("")

  useEffect(() => {
    try {
      const json = JSON.parse(content) as JSONContent
      setHtml(generateHTML(json, extensions))
    } catch {
      setHtml(content)
    }
  }, [content])

  return (
    <div
      className="prose prose-stone max-w-none
        prose-headings:font-serif prose-headings:text-ink
        prose-p:text-ink prose-p:leading-[1.8]
        prose-a:text-accent prose-strong:text-ink
        prose-blockquote:border-l-accent prose-blockquote:text-ink-muted
        prose-code:text-accent prose-code:bg-paper prose-code:rounded
        prose-img:rounded-lg"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
