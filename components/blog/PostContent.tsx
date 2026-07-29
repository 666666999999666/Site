"use client"

/* eslint-disable @next/next/no-img-element -- Markdown can contain arbitrary external image sources. */

import {
  Children,
  isValidElement,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { createHeadingSlugger, normalizeContent } from "@/lib/content"
import { useTheme } from "@/components/theme/ThemeProvider"
import { Lightbox } from "./Lightbox"

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const id = useId().replace(/:/g, "")
  const { theme } = useTheme()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "strict",
        })
        const result = await mermaid.render(`mermaid-${id}`, code)
        if (!cancelled) {
          setSvg(result.svg)
          setError("")
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught))
          setSvg("")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, id, theme])

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="mb-2 font-mono text-xs text-destructive">Mermaid 渲染失败</p>
        <pre className="overflow-x-auto text-xs text-muted-foreground">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="my-6 flex min-h-20 justify-center overflow-x-auto"
      aria-label="流程图"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function nodeText(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child)
    if (isValidElement<{ children?: ReactNode }>(child)) return nodeText(child.props.children)
    return ""
  }).join("")
}

const baseComponents: Components = {
  code({ className, children, ...props }) {
    const language = /language-(\w+)/.exec(className || "")?.[1] || ""
    const text = String(children).replace(/\n$/, "")
    if (language === "mermaid") return <MermaidBlock code={text} />
    if (!className && !text.includes("\n")) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm" {...props}>
          {children}
        </code>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  pre({ children }) {
    if (isValidElement(children) && children.type === MermaidBlock) return children
    return (
      <pre className="my-4 overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-sm leading-6 dark:bg-zinc-900">
        {children}
      </pre>
    )
  },
  a({ href, children }) {
    const external = Boolean(href && !href.startsWith("/") && !href.startsWith("#"))
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
      >
        {children}
      </a>
    )
  },
  img({ src, alt }) {
    return (
      <img
        src={typeof src === "string" ? src : ""}
        alt={alt || ""}
        data-lightbox-image
        role="button"
        tabIndex={0}
        className="mx-auto my-4 h-auto max-w-full cursor-zoom-in rounded-lg"
        loading="lazy"
      />
    )
  },
  table({ children }) {
    return (
      <div className="my-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border border-border bg-muted/50 px-3 py-2 text-left font-semibold">
        {children}
      </th>
    )
  },
  td({ children }) {
    return <td className="border border-border px-3 py-2">{children}</td>
  },
  hr() {
    return <hr className="my-8 border-border" />
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-4 border-border/40 pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    )
  },
}

export const PostContent = memo(function PostContent({ content }: { content: string }) {
  const normalized = normalizeContent(content)
  const slug = createHeadingSlugger()
  const components: Components = {
    ...baseComponents,
    h2({ children }) {
      return <h2 id={slug(nodeText(children))}>{children}</h2>
    },
    h3({ children }) {
      return <h3 id={slug(nodeText(children))}>{children}</h3>
    },
    h4({ children }) {
      return <h4 id={slug(nodeText(children))}>{children}</h4>
    },
  }

  return (
    <>
      <div
        className="prose prose-neutral max-w-none dark:prose-invert
          prose-headings:font-sans prose-headings:text-foreground
          prose-h1:mt-8 prose-h1:mb-4 prose-h1:text-3xl
          prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:border-border/40 prose-h2:pb-2 prose-h2:text-2xl
          prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-xl
          prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-lg
          prose-p:my-4 prose-p:leading-[1.8] prose-p:text-foreground
          prose-strong:font-semibold prose-strong:text-foreground
          prose-em:text-foreground
          prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
          prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
          prose-li:my-1 prose-li:text-foreground
          prose-img:rounded-lg"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            rehypeKatex,
            [rehypeHighlight, { detect: true, ignoreMissing: true }],
          ]}
          components={components}
        >
          {normalized}
        </ReactMarkdown>
      </div>
      <Lightbox />
    </>
  )
})
