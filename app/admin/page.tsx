import { prisma } from "@/lib/db"
import Link from "next/link"
import { Container } from "@/components/layout/Container"

export default async function AdminHome() {
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
      <h1 className="text-3xl font-semibold mb-8">概览</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Link href="/admin/posts" className="p-6 rounded-xl bg-card border border-border/50 hover:border-primary transition-colors">
          <div className="text-3xl font-semibold text-primary">{postCount}</div>
          <div className="text-sm text-muted-foreground mt-1">文章总数（{draftCount} 草稿）</div>
        </Link>
        <Link href="/admin/todos" className="p-6 rounded-xl bg-card border border-border/50 hover:border-primary transition-colors">
          <div className="text-3xl font-semibold text-primary">{todoCount}</div>
          <div className="text-sm text-muted-foreground mt-1">Todo 总数</div>
        </Link>
        <Link href="/admin/posts/new" className="p-6 rounded-xl bg-card border border-border/50 hover:border-primary transition-colors">
          <div className="text-3xl font-semibold text-primary">＋</div>
          <div className="text-sm text-muted-foreground mt-1">写新文章</div>
        </Link>
      </div>

      <h2 className="text-xl font-semibold mb-4">待办</h2>
      {pendingTodos.length === 0 ? (
        <p className="text-muted-foreground">暂无待办。</p>
      ) : (
        <ul className="space-y-2">
          {pendingTodos.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <span>{t.title}</span>
              {t.category && <span className="text-xs text-muted-foreground">{t.category.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
