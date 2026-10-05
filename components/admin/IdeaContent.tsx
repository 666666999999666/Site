"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { remarkPreserveSoftBreaks } from "@/lib/remark-preserve-soft-breaks"
import { MarkdownTable } from "@/components/blog/MarkdownTable"

const components: Components = {
  a({ href, children, title }) {
    return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
  },
  pre({ children }) {
    return <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-slate-100">{children}</pre>
  },
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>
  },
}

export function IdeaContent({ content }: { content: string }) {
  if (!content.trim()) return <p className="text-muted-foreground">暂无正文。</p>
  return (
    <div className="markdown-reading admin-reading prose prose-neutral min-w-0 max-w-none dark:prose-invert
      prose-headings:font-sans prose-headings:text-foreground
      prose-p:leading-[1.85] prose-p:text-foreground prose-li:text-foreground
      prose-a:text-primary prose-strong:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkPreserveSoftBreaks]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >{content}</ReactMarkdown>
    </div>
  )
}
