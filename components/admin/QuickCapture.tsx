"use client"

import Link from "next/link"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import type { InboxItemView } from "@/lib/inbox-view"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentDraft } from "./useDocumentDraft"
import { DraftRecoveryNotice } from "./DraftRecoveryNotice"

const emptyCapture = { rawInput: "", requestKey: "" }

export function QuickCapture({ ownerId }: { ownerId: string }) {
  const router = useRouter()
  const draft = useDocumentDraft({ initialData: emptyCapture, storageKey: "qz-quick-capture:" + ownerId, label: "素材" })
  const { rawInput } = draft.data
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<InboxItemView | null>(null)
  const submitting = useRef(false)

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !draft.ready || draft.recovery || !rawInput.trim()) return
    submitting.current = true
    setPending(true)
    setError("")
    setSaved(null)
    const snapshot = { rawInput, requestKey: draft.data.requestKey || crypto.randomUUID() }
    draft.update(snapshot)
    try {
      const item = await apiRequest<InboxItemView>("/api/inbox/items", jsonRequest("POST", { ...snapshot, mode: "material" }))
      setSaved(item)
      draft.commit(emptyCapture)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，原文仍在这里，可以重试。")
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="quick-capture-heading" className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
      <h2 id="quick-capture-heading" className="text-xl font-semibold">先记下来</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">文字、链接、碎片想法都可以。不用写前缀，默认只保存为私人素材，不会自动变成待办。</p>
      <div className="mt-4">
        {draft.recovery && <DraftRecoveryNotice onRestore={draft.restore} onDiscard={draft.discardRecovery} />}
        {draft.storageError && <p role="alert" className="mb-3 text-sm text-destructive">{draft.storageError}</p>}
      </div>
      <form onSubmit={capture} className="space-y-3">
        <Textarea aria-label="快速记录原文" value={rawInput} disabled={pending || !draft.ready || !!draft.recovery} rows={5}
          placeholder="想到什么就放在这里，之后再挑想讨论或真正要做的事。"
          onChange={(event) => draft.update({ rawInput: event.target.value, requestKey: crypto.randomUUID() })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/inbox" className="text-sm text-muted-foreground hover:underline">查看收件箱原文与记录</Link>
          <Button type="submit" disabled={pending || !draft.ready || !!draft.recovery || !rawInput.trim()}>{pending ? "保存中…" : "保存素材"}</Button>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {saved && (
        <p role="status" className="mt-3 text-sm">
          {saved.status === "FAILED" ? "原文已保存，素材整理未完成，可在收件箱重试。" : "已保存，原文会独立保留。"}{" "}
          <Link href={saved.execution?.targetHref ?? "/admin/inbox"} className="text-primary underline">查看</Link>
        </p>
      )}
    </section>
  )
}
