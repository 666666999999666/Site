"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import type { Series } from "@/lib/generated/prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type SeriesMutationInput = {
  title: string
  slug?: string
  description: string
  coverImage?: string | null
  sortOrder?: number
}

function parseSortOrder(value: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < -10_000 || parsed > 10_000) {
    throw new Error("系列排序必须是 -10000 到 10000 之间的整数")
  }
  return parsed
}

export function SeriesManager({
  items,
  disabled,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: Series[]
  disabled?: boolean
  onCreate: (input: SeriesMutationInput) => Promise<void>
  onUpdate: (id: string, input: SeriesMutationInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [newTitle, setNewTitle] = useState("")
  const [newSlug, setNewSlug] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newCoverImage, setNewCoverImage] = useState("")
  const [newSortOrder, setNewSortOrder] = useState("0")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editCoverImage, setEditCoverImage] = useState("")
  const [editSortOrder, setEditSortOrder] = useState("0")
  const [error, setError] = useState("")

  async function create() {
    if (!newTitle.trim() || !newDescription.trim()) {
      setError("系列标题和简介均为必填项")
      return
    }
    setError("")
    try {
      await onCreate({
        title: newTitle.trim(),
        ...(newSlug.trim() ? { slug: newSlug.trim() } : {}),
        description: newDescription.trim(),
        coverImage: newCoverImage.trim() || null,
        sortOrder: parseSortOrder(newSortOrder),
      })
      setNewTitle("")
      setNewSlug("")
      setNewDescription("")
      setNewCoverImage("")
      setNewSortOrder("0")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建系列失败")
    }
  }

  function startEdit(item: Series) {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditSlug(item.slug)
    setEditDescription(item.description ?? "")
    setEditCoverImage(item.coverImage ?? "")
    setEditSortOrder(String(item.sortOrder))
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editSlug.trim() || !editDescription.trim()) {
      setError("系列标题、slug 和简介均为必填项")
      return
    }
    setError("")
    try {
      await onUpdate(editingId, {
        title: editTitle.trim(),
        slug: editSlug.trim(),
        description: editDescription.trim(),
        coverImage: editCoverImage.trim() || null,
        sortOrder: parseSortOrder(editSortOrder),
      })
      setEditingId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新系列失败")
    }
  }

  async function remove(item: Series) {
    if (!window.confirm(`删除“${item.title}”？文章会保留，但会解除系列关联。`)) return
    setError("")
    try {
      await onDelete(item.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除系列失败")
    }
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">暂无系列</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="rounded-md border border-border/60 p-2">
          {editingId === item.id ? (
            <div className="space-y-2">
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                aria-label="系列标题"
                className="h-8 text-sm"
                maxLength={120}
                autoFocus
              />
              <Input
                value={editSlug}
                onChange={(event) => setEditSlug(event.target.value)}
                aria-label="系列 slug"
                className="h-8 text-sm"
                maxLength={120}
              />
              <Textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                aria-label="系列简介"
                rows={2}
                maxLength={1000}
                className="text-sm"
              />
              <Input
                value={editCoverImage}
                onChange={(event) => setEditCoverImage(event.target.value)}
                aria-label="系列封面路径"
                placeholder="/uploads/cover.webp"
                className="h-8 text-sm"
                maxLength={255}
              />
              <Input
                value={editSortOrder}
                onChange={(event) => setEditSortOrder(event.target.value)}
                aria-label="系列排序"
                type="number"
                min={-10000}
                max={10000}
                className="h-8 text-sm"
              />
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={saveEdit} disabled={disabled} aria-label="保存系列">
                  <Check className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setEditingId(null)} aria-label="取消编辑系列">
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.sortOrder} · /{item.slug}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => startEdit(item)} disabled={disabled} aria-label={`编辑系列 ${item.title}`}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7 hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(item)} disabled={disabled} aria-label={`删除系列 ${item.title}`}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      ))}
      <div className="space-y-1.5 pt-1">
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="新系列标题"
          aria-label="新系列标题"
          className="h-8 text-sm"
          maxLength={120}
        />
        <Input
          value={newSlug}
          onChange={(event) => setNewSlug(event.target.value)}
          placeholder="slug（可留空）"
          aria-label="新系列 slug"
          className="h-8 text-sm"
          maxLength={120}
        />
        <Textarea
          value={newDescription}
          onChange={(event) => setNewDescription(event.target.value)}
          placeholder="系列简介（必填）"
          aria-label="新系列简介"
          rows={2}
          maxLength={1000}
          className="text-sm"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-1">
          <Input
            value={newCoverImage}
            onChange={(event) => setNewCoverImage(event.target.value)}
            placeholder="/uploads/封面（可选）"
            aria-label="新系列封面路径"
            className="h-8 text-sm"
            maxLength={255}
          />
          <Input
            value={newSortOrder}
            onChange={(event) => setNewSortOrder(event.target.value)}
            aria-label="新系列排序"
            type="number"
            min={-10000}
            max={10000}
            className="h-8 text-sm"
          />
        </div>
        <Button type="button" variant="outline" className="h-8 w-full" onClick={create} disabled={disabled}>
          <Plus className="size-4" />
          创建系列
        </Button>
      </div>
      {error && <p role="alert" className="px-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
