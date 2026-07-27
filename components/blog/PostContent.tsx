"use client"

import { useEffect, useState, useRef, memo, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeHighlight from "rehype-highlight"
import type { Components } from "react-markdown"
import { Lightbox } from "./Lightbox"

/**
 * Mermaid 流程图客户端渲染组件
 * mermaid 必须在客户端运行（依赖 DOM 测量），SSR 时输出原始代码占位
 */
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string>("")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "default",
          securityLevel: "loose",
        })
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const { svg: rendered } = await mermaid.render(id, code)
        if (!cancelled) {
          setSvg(rendered)
          setError("")
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setSvg("")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-xs text-destructive mb-2 font-mono">Mermaid 渲染失败：</p>
        <pre className="text-xs text-muted-foreground overflow-x-auto">
          <code>{code}</code>
        </pre>
        <p className="text-xs text-muted-foreground mt-2">{error}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-6 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/**
 * 自定义 Markdown 元素渲染
 */
const components: Components = {
  // mermaid 代码块走客户端渲染
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const lang = match?.[1] || ""
    const text = String(children).replace(/\n$/, "")

    if (lang === "mermaid") {
      return <MermaidBlock code={text} />
    }

    // 行内代码 vs 代码块：react-markdown v9+ 通过 node 判断
    // 但更稳妥的方式是看 className 或内容是否含换行
    if (!className && !text.includes("\n")) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
          {children}
        </code>
      )
    }

    // 普通代码块：rehype-highlight 会处理高亮，这里只加样式容器
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  // 代码块外层 pre：移除 prose 默认背景，让 rehype-highlight 主题生效
  pre({ children }) {
    return (
      <pre className="my-4 p-4 rounded-lg bg-zinc-950 dark:bg-zinc-900 overflow-x-auto text-sm leading-6 font-mono">
        {children}
      </pre>
    )
  },
  // 链接：外链新开标签
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground transition-colors"
      >
        {children}
      </a>
    )
  },
  // 图片：支持 lightbox
  img({ src, alt }) {
    return (
      <img
        src={typeof src === "string" ? src : ""}
        alt={alt || ""}
        className="rounded-lg max-w-full h-auto cursor-zoom-in my-4 mx-auto"
        loading="lazy"
      />
    )
  },
  // 表格：水平滚动容器
  table({ children }) {
    return (
      <div className="my-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border border-border px-3 py-2 text-left font-semibold bg-muted/50">
        {children}
      </th>
    )
  },
  td({ children }) {
    return <td className="border border-border px-3 py-2">{children}</td>
  },
  // 分割线
  hr() {
    return <hr className="my-8 border-border" />
  },
  // 引用块
  blockquote({ children }) {
    return (
      <blockquote className="my-4 pl-4 border-l-4 border-border/40 text-muted-foreground italic">
        {children}
      </blockquote>
    )
  },
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * 检测内容是否为 Tiptap JSON 格式，如果是则提取纯文本
 * 旧文章可能存储的是 Tiptap 的 JSON 格式，新文章是 Markdown
 */
function normalizeContent(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  // Tiptap JSON 以 {"type":"doc" 开头
  if (trimmed.startsWith('{"type":"doc"') || trimmed.startsWith('{"type": "doc"')) {
    try {
      const json = JSON.parse(trimmed)
      const lines: string[] = []

      function walk(node: Record<string, unknown>) {
        if (node.type === "text" && typeof node.text === "string") {
          // 根据标记添加格式
          if (Array.isArray(node.marks)) {
            for (const mark of node.marks as Record<string, unknown>[]) {
              if (mark.type === "bold") {
                lines.push(`**${node.text}**`)
                return
              }
              if (mark.type === "italic") {
                lines.push(`*${node.text}*`)
                return
              }
              if (mark.type === "code") {
                lines.push(`\`${node.text}\``)
                return
              }
            }
          }
          lines.push(node.text)
        } else if (node.type === "hardBreak") {
          lines.push("\n")
        } else if (node.type === "paragraph") {
          // 段落结束后加空行
          if (Array.isArray(node.content)) {
            for (const child of node.content as Record<string, unknown>[]) walk(child)
          }
          lines.push("\n")
        } else if (node.type === "heading") {
          const level = (node.attrs as { level?: number })?.level ?? 2
          const prefix = "#".repeat(level) + " "
          if (Array.isArray(node.content)) {
            lines.push(prefix)
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
      // JSON 解析失败，当作普通文本
      return raw
    }
  }

  return raw
}

export const PostContent = memo(function PostContent({
  content,
}: {
  content: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const normalizedContent = useMemo(() => normalizeContent(content), [content])

  // Inject id attributes on headings for TOC anchor links
  useEffect(() => {
    if (!ref.current) return
    const headings = ref.current.querySelectorAll("h2, h3, h4")
    headings.forEach((el) => {
      if (!el.id) {
        el.id = slugify(el.textContent || "")
      }
    })
  }, [content])

  return (
    <>
      <div
        ref={ref}
        className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-sans prose-headings:text-foreground
          prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4
          prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:border-border/40 prose-h2:pb-2
          prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
          prose-h4:text-lg prose-h4:mt-4 prose-h4:mb-2
          prose-p:text-foreground prose-p:leading-[1.8] prose-p:my-4
          prose-strong:text-foreground prose-strong:font-semibold
          prose-em:text-foreground
          prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
          prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
          prose-li:my-1 prose-li:text-foreground
          prose-img:rounded-lg"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={components}
        >
          {normalizedContent || ""}
        </ReactMarkdown>
      </div>
      <Lightbox />
    </>
  )
})
