"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import type { Category } from "@/lib/generated/prisma/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function CategoryManager({
  groups,
  activeGroupId,
  itemLabel,
  disabled,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: {
  groups: Category[]
  activeGroupId: string | null
  itemLabel: string
  disabled?: boolean
  onSelect: (id: string | null) => void
  onCreate: (name: string) => Promise<void>
  onUpdate: (id: string, input: { name: string; sortOrder: number }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editSortOrder, setEditSortOrder] = useState(0)
  const [error, setError] = useState("")

  async function create() {
    if (!newName.trim()) return
    setError("")
    try {
      await onCreate(newName.trim())
      setNewName("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建分区失败")
    }
  }

  function startEdit(group: Category) {
    setEditingId(group.id)
    setEditName(group.name)
    setEditSortOrder(group.sortOrder)
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setError("")
    try {
      await onUpdate(editingId, {
        name: editName.trim(),
        sortOrder: editSortOrder,
      })
      setEditingId(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新分区失败")
    }
  }

  async function remove(group: Category) {
    if (!window.confirm(`删除“${group.name}”？该分区下${itemLabel}会变为无分区。`)) return
    setError("")
    try {
      await onDelete(group.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除分区失败")
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors",
          activeGroupId === null
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent"
        )}
      >
        全部
      </button>

      {groups.map((group) => (
        <div key={group.id} className="group relative">
          {editingId === group.id ? (
            <div className="space-y-2 rounded-md border border-border p-2">
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) void saveEdit()
                  if (event.key === "Escape") setEditingId(null)
                }}
                className="h-8 text-sm"
                aria-label="分区名称"
                autoFocus
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={editSortOrder}
                  onChange={(event) => setEditSortOrder(Number(event.target.value))}
                  className="h-8 min-w-0 text-sm"
                  aria-label="排序值"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={saveEdit}
                  aria-label="保存分区"
                  disabled={disabled}
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingId(null)}
                  aria-label="取消编辑分区"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                className={cn(
                  "flex w-full items-center rounded-md py-2 pl-3 pr-18 text-left text-sm transition-colors",
                  activeGroupId === group.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <span
                  className="mr-2 size-2 shrink-0 rounded-full"
                  style={{ background: group.color || "#6366f1" }}
                />
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
              </button>
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => startEdit(group)}
                  aria-label={`编辑分区 ${group.name}`}
                  disabled={disabled}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove(group)}
                  aria-label={`删除分区 ${group.name}`}
                  disabled={disabled}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="flex gap-1 pt-2">
        <Input
          placeholder="新分区"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void create()
          }}
          className="h-8 min-w-0 text-sm"
          maxLength={80}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          onClick={create}
          aria-label="创建分区"
          disabled={disabled}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {error && <p role="alert" className="px-1 pt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
