"use client"

import { useRef, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { useTranslations } from "next-intl"
import { copyText } from "@/lib/copy-text"

export function CodeBlock({ source, language, children }: {
  source: string
  language: string
  children: ReactNode
}) {
  const [copyStatus, setCopyStatus] = useState<{ source: string; status: "idle" | "copying" | "success" | "error" }>({ source, status: "idle" })
  const status = copyStatus.source === source ? copyStatus.status : "idle"
  const copying = useRef(false)
  const t = useTranslations("content")

  const copy = async () => {
    if (copying.current) return
    copying.current = true
    setCopyStatus({ source, status: "copying" })
    const copied = await copyText(source)
    setCopyStatus({ source, status: copied ? "success" : "error" })
    copying.current = false
  }

  return (
    <div className="my-4 min-w-0 overflow-hidden rounded-lg bg-zinc-950 text-zinc-100 dark:bg-zinc-900" data-code-block>
      <div className="not-prose flex min-h-11 items-center justify-between gap-3 border-b border-white/10 px-4 py-1">
        <span className="truncate font-mono text-xs text-zinc-400">{language}</span>
        <button
          type="button"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded px-2 text-xs text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={copy}
          aria-disabled={status === "copying"}
          aria-busy={status === "copying"}
          aria-label={t("copyCode")}
        >
          {status === "success" ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {status === "copying" ? t("copyingCode") : status === "success" ? t("codeCopied") : t("copyCode")}
        </button>
      </div>
      <pre className="!m-0 overflow-x-auto rounded-b-lg bg-zinc-950 p-4 font-mono text-sm leading-6 dark:bg-zinc-900">{children}</pre>
      <p role="status" aria-live="polite" className={status === "error" ? "not-prose m-0 px-4 pb-3 text-xs text-amber-200" : "sr-only"}>
        {status === "success" ? t("codeCopied") : status === "error" ? t("codeCopyFailed") : ""}
      </p>
    </div>
  )
}
