import { prisma } from "@/lib/db"
import Link from "next/link"
import { Container } from "@/components/layout/Container"

export default async function AdminOverviewPage() {
  const [postCount, todoCount, draftCount, pendingTodos] = await Promise.all([
    prisma.post.count(),
    prisma.todo.count(),
    prisma.post.count({ where: { status: "DRAFT" } }),
    prisma.todo.findMany({
      where: { status: "TODO" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { category: true },
    }),
  ])

  return (
    <Container>
      <h1 className="mb-8 text-3xl font-semibold">概览</h1>
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/admin/posts" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{postCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">文章总数（{draftCount} 草稿）</div>
        </Link>
        <Link href="/admin/todos" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{todoCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">Todo 总数</div>
        </Link>
        <Link href="/admin/posts/new" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">＋</div>
          <div className="mt-1 text-sm text-muted-foreground">写新文章</div>
        </Link>
      </div>

      <h2 className="mb-4 text-xl font-semibold">待办</h2>
      {pendingTodos.length === 0 ? (
        <p className="text-muted-foreground">暂无待办。</p>
      ) : (
        <ul className="space-y-2">
          {pendingTodos.map((todo) => (
            <li key={todo.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <span>{todo.title}</span>
              {todo.category && <span className="text-xs text-muted-foreground">{todo.category.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
