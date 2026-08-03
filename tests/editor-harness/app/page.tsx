"use client"

import { useState } from "react"
import { PostEditor } from "@/components/admin/PostEditor"

const initialValue = [
  "ABCDE",
  "",
  "## HEADING",
  "",
  "- LIST ITEM",
  "",
  "> QUOTE",
  "",
  "TAIL",
].join("\n")

export default function EditorHarnessPage() {
  const [value, setValue] = useState(initialValue)

  return (
    <main>
      <PostEditor value={value} onChange={setValue} />
      <pre data-testid="markdown-output" hidden>{value}</pre>
    </main>
  )
}
