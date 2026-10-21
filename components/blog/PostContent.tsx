"use client"

/* eslint-disable @next/next/no-img-element -- Markdown can contain arbitrary external image sources. */

import {
  Children,
  isValidElement,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useTranslations } from "next-intl"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { extractHeadings, normalizeContentForDisplay, slugifyHeading } from "@/lib/content"
import { useTheme } from "@/components/theme/ThemeProvider"
import { Lightbox } from "./Lightbox"
import { MarkdownTable } from "./MarkdownTable"
import { CodeBlock } from "./CodeBlock"
import { codeBlockSource, rehypeCodeSource, remarkCodeSource } from "@/lib/rehype-code-source"
import { decodeImageTitle } from "@/lib/image-presentation"
import type { ResponsiveImage } from "@/lib/responsive-image"
import { remarkEmptyTableCells } from "@/lib/remark-empty-table-cells"

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const id = useId().replace(/:/g, "")
  const { theme } = useTheme()
  const t = useTranslations("content")

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
        <p className="mb-2 font-mono text-xs text-destructive">{t("mermaidError")}</p>
        <pre className="overflow-x-auto text-xs text-muted-foreground">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="my-6 flex min-h-20 justify-center overflow-x-auto"
      aria-label={t("mermaidDiagram")}
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
  code({ className, children, node, ...props }) {
    return (
      <code className={node?.data?.readerCodeBlock ? className : "rounded bg-muted px-1.5 py-0.5 font-mono text-sm"} {...props}>
        {children}
      </code>
    )
  },
  pre({ children, node }) {
    const block = codeBlockSource(node)
    if (block?.language === "mermaid") return <MermaidBlock code={block.source} />
    return <CodeBlock source={block?.source ?? nodeText(children)} language={block?.language ?? ""}>{children}</CodeBlock>
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
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>
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
      <blockquote className="my-4 border-l-4 border-border/40 pl-4 text-muted-foreground">
        {children}
      </blockquote>
    )
  },
}

function fallbackArticleImage(image: HTMLImageElement) {
  const original = image.dataset.originalSrc
  if (!original || !image.hasAttribute("srcset")) return
  image.removeAttribute("srcset")
  image.removeAttribute("sizes")
  image.src = original
}

export const PostContent = memo(function PostContent({ content, imageMetadata = {} }: {
  content: string
  imageMetadata?: Record<string, ResponsiveImage>
}) {
  const t = useTranslations("content")
  const containerRef = useRef<HTMLDivElement>(null)
  const normalized = normalizeContentForDisplay(content)
  useEffect(() => {
    // A lazy image may fail before hydration attaches its error handler.
    // Recover that completed failure once; later failures use onError below.
    const images = containerRef.current?.querySelectorAll<HTMLImageElement>("img[data-lightbox-image][srcset]")
    images?.forEach((image) => {
      if (image.complete && image.naturalWidth === 0) fallbackArticleImage(image)
    })
  }, [normalized, imageMetadata])
  const headingIds = new Map(
    extractHeadings(normalized).flatMap((heading) => (
      heading.line ? [[`${heading.level}:${heading.line}`, heading.id] as const] : []
    ))
  )
  const headingId = (level: number, line: number | undefined, children: ReactNode) => (
    (line ? headingIds.get(`${level}:${line}`) : undefined) ?? slugifyHeading(nodeText(children))
  )
  const components: Components = {
    ...baseComponents,
    img({ src, alt, title }) {
      const original = typeof src === "string" ? src : ""
      const presentation = decodeImageTitle(title)
      const metadata = Object.hasOwn(imageMetadata, original) ? imageMetadata[original] : undefined
      const displayWidth = presentation.width ?? 768
      return (
        <img
          src={original}
          srcSet={metadata?.variants.length ? metadata.variants.map((variant) => `${variant.url} ${variant.width}w`).join(", ") : undefined}
          sizes={metadata?.variants.length ? `(max-width: ${displayWidth + 48}px) calc(100vw - 48px), ${displayWidth}px` : undefined}
          onError={(event) => {
            // Never retry a broken original: the first fallback removes srcset.
            fallbackArticleImage(event.currentTarget)
          }}
          alt={alt || ""}
          title={presentation.title}
          width={metadata?.width ?? presentation.width}
          height={metadata?.height}
          style={{ width: presentation.width, maxWidth: "100%", height: "auto" }}
          data-original-src={original}
          data-original-width={metadata?.width}
          data-lightbox-image
          role="button"
          aria-label={alt?.trim() ? undefined : t("imagePreview")}
          tabIndex={0}
          className="mx-auto my-4 h-auto max-w-full cursor-zoom-in rounded-lg"
          loading="lazy"
          decoding="async"
        />
      )
    },
    h2({ children, node }) {
      return <h2 id={headingId(2, node?.position?.start.line, children)}>{children}</h2>
    },
    h3({ children, node }) {
      return <h3 id={headingId(3, node?.position?.start.line, children)}>{children}</h3>
    },
    h4({ children, node }) {
      return <h4 id={headingId(4, node?.position?.start.line, children)}>{children}</h4>
    },
  }

  return (
    <>
      <div
        ref={containerRef}
        className="markdown-reading prose prose-neutral min-w-0 max-w-none dark:prose-invert
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
          remarkPlugins={[remarkGfm, remarkEmptyTableCells, remarkMath, remarkCodeSource]}
          rehypePlugins={[
            rehypeCodeSource,
            rehypeKatex,
            [rehypeHighlight, { detect: true, ignoreMissing: true }],
          ]}
          components={components}
        >
          {normalized}
        </ReactMarkdown>
      </div>
      <Lightbox containerRef={containerRef} />
    </>
  )
})
