export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-6 py-16" aria-label="页面加载中">
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="mt-4 h-4 w-72 max-w-full rounded bg-muted" />
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-40 rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
