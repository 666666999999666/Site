"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split("\n")

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-zinc-950 dark:bg-zinc-900 my-6">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-400 font-mono">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <div className="relative overflow-x-auto">
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col items-end pr-3 pt-4 select-none">
          {lines.map((_, i) => (
            <span key={i} className="text-xs text-zinc-600 leading-6">
              {i + 1}
            </span>
          ))}
        </div>
        <pre className="p-4 pl-14 overflow-x-auto">
          <code className="text-sm text-zinc-300 font-mono leading-6">{code}</code>
        </pre>
      </div>
    </div>
  )
}
