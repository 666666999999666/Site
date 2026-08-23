import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

const PRIVATE_IMAGE_PATTERN = /^\/api\/questions\/images\/[A-Za-z0-9_-]{1,128}$/

const markdownComponents: Components = {
  a({ href, children, title }) {
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
  img({ src, alt }) {
    if (typeof src !== "string" || !PRIVATE_IMAGE_PATTERN.test(src)) {
      return <span className="text-sm text-destructive">[已拦截非私有图片]</span>
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt || "题目图片"} loading="lazy" />
  },
  pre({ children }) {
    return <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-slate-100">{children}</pre>
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto">
        <table>{children}</table>
      </div>
    )
  },
}

export function QuestionMarkdown({
  markdown,
  className,
  emptyText = "暂无内容",
}: {
  markdown: string | null | undefined
  className?: string
  emptyText?: string
}) {
  if (!markdown?.trim()) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyText}</p>
  }

  return (
    <div
      className={cn(
        "prose prose-neutral max-w-none break-words dark:prose-invert",
        "prose-headings:font-sans prose-headings:text-foreground prose-p:leading-7 prose-p:text-foreground",
        "prose-a:text-primary prose-a:underline prose-strong:text-foreground prose-li:text-foreground",
        "prose-img:max-h-[32rem] prose-img:rounded-lg prose-img:border prose-img:border-border/70",
        "prose-code:break-words prose-code:before:content-none prose-code:after:content-none",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
