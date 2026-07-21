"use client"

import { useState } from "react"
import type { Category } from "@/lib/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

export function TodoGroupManager({
  groups,
  activeGroupId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  groups: Category[]
  activeGroupId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  function handleCreate() {
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName("")
  }

  function startEdit(id: string, currentName: string) {
    setEditingId(id)
    setEditName(currentName)
  }

  function confirmEdit() {
    if (!editingId || !editName.trim()) return
    onRename(editingId, editName.trim())
    setEditingId(null)
    setEditName("")
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName("")
  }

  return (
    <div className="space-y-1">
      {/* 全部 */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full flex items-center rounded-md px-3 py-2 text-sm transition-colors",
          activeGroupId === null
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent"
        )}
      >
        全部
      </button>

      {/* 各分区 */}
      {groups.map((g) => (
        <div key={g.id} className="group relative">
          {editingId === g.id ? (
            <div className="flex items-center gap-1 px-3 py-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit()
                  if (e.key === "Escape") cancelEdit()
                }}
                className="h-7 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={confirmEdit}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => onSelect(g.id)}
              className={cn(
                "w-full flex items-center rounded-md px-3 py-2 text-sm transition-colors pr-16",
                activeGroupId === g.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0 mr-2" style={{ background: g.color || "#6366f1" }} />
              {g.name}
            </button>
          )}

          {editingId !== g.id && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  startEdit(g.id, g.name)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm("删除分区？分区下 Todo 的分区会置空")) onDelete(g.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* 新建分区 */}
      <div className="flex gap-1 pt-2">
        <Input
          placeholder="新分区…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="h-8 text-sm"
        />
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
