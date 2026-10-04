import { Button } from "@/components/ui/button"

export function DraftRecoveryNotice({
  onRestore, onDiscard,
}: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">发现未保存的本地草稿。恢复只更新编辑内容，不会自动保存或发布。</p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" onClick={onRestore}>恢复草稿</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDiscard}>丢弃本地草稿</Button>
      </div>
    </div>
  )
}
