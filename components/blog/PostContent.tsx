"use client"

import { useEffect, useState, useRef } from "react"
import { generateHTML } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { type JSONContent } from "@tiptap/core"
import { Lightbox } from "./Lightbox"

const extensions = [StarterKit, Image]

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function PostContent({ content }: { content: string }) {
  const [html, setHtml] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const json = JSON.parse(content) as JSONContent
      setHtml(generateHTML(json, extensions))
    } catch {
      setHtml(content)
    }
  }, [content])

  // Inject id attributes on headings for TOC anchor links
  useEffect(() => {
    if (!ref.current || !html) return
    const headings = ref.current.querySelectorAll("h2, h3, h4")
    headings.forEach((el) => {
      if (!el.id) {
        el.id = slugify(el.textContent || "")
      }
    })
  }, [html])

  return (
    <>
      <div
        ref={ref}
        className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-sans prose-headings:text-foreground
          prose-p:text-foreground prose-p:leading-[1.8]
          prose-a:text-foreground prose-a:underline prose-a:decoration-foreground/30 prose-a:underline-offset-4 hover:prose-a:decoration-foreground
          prose-strong:text-foreground
          prose-blockquote:border-l-foreground/30 prose-blockquote:text-muted-foreground
          prose-code:text-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-transparent prose-pre:p-0
          prose-img:rounded-lg prose-img:cursor-zoom-in
          prose-hr:border-border
          prose-li:text-foreground
          prose-th:text-foreground prose-td:text-foreground
          prose-th:border-border prose-td:border-border"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <Lightbox />
    </>
  )
}
