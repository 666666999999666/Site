import { prisma } from "@/lib/db"
import Link from "next/link"
import { Container } from "@/components/layout/Container"
import { ensureAuthenticated } from "@/lib/api/auth"

export default async function AdminOverviewPage() {
  const { userId } = await ensureAuthenticated()
  const [postCount, todoCount, ideaCount, inboxAttentionCount, draftCount, pendingTodos] = await Promise.all([
    prisma.post.count(),
    prisma.todo.count(),
    prisma.idea.count({ where: { ownerId: userId } }),
    prisma.inboxItem.count({
      where: { ownerId: userId, status: { in: ["RECEIVED", "FAILED"] } },
    }),
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
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/posts" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{postCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">文章（{draftCount} 篇草稿）</div>
        </Link>
        <Link href="/admin/ideas" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{ideaCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">私人 Idea</div>
        </Link>
        <Link href="/admin/todos" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{todoCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">Todo 总数</div>
        </Link>
        <Link href="/admin/inbox" className="rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary">
          <div className="text-3xl font-semibold text-primary">{inboxAttentionCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">收件箱待处理或失败</div>
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
