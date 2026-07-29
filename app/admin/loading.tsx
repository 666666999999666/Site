export default function AdminLoading() {
  return (
    <div className="animate-pulse" aria-label="后台加载中">
      <div className="h-8 w-36 rounded bg-muted" />
      <div className="mt-8 h-44 rounded-lg border border-border bg-muted/30" />
    </div>
  )
}
