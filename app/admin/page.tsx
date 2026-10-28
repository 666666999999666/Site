import Link from "next/link"
import { ensureAuthenticated } from "@/lib/api/auth"
import { prisma } from "@/lib/db"
import { getDailyDashboard } from "@/lib/daily"
import { DailyTopThree } from "@/components/admin/DailyTopThree"
import { QuickCapture } from "@/components/admin/QuickCapture"
import { Container } from "@/components/layout/Container"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MATERIAL_STATUS_LABELS } from "@/lib/material-status"

export const dynamic = "force-dynamic"


export default async function AdminHomePage() {
  const { userId } = await ensureAuthenticated()
  const [dashboard, recent, resume] = await Promise.all([
    getDailyDashboard(userId),
    prisma.idea.findMany({
      where: { ownerId: userId }, orderBy: { capturedAt: "desc" }, take: 6,
      select: { id: true, title: true, discussionStatus: true, capturedAt: true },
    }),
    prisma.idea.findMany({
      where: { ownerId: userId, discussionStatus: "WANT_DISCUSS" }, orderBy: { updatedAt: "desc" }, take: 4,
      select: { id: true, title: true, discussionSummary: true },
    }),
  ])

  return (
    <Container size="wide" className="max-w-6xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">工作台</h1>
        <p className="mt-2 text-sm text-muted-foreground">先收集，想清楚后再行动。</p>
      </header>
      <QuickCapture ownerId={userId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-materials-heading" className="rounded-xl border border-border/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-materials-heading" className="text-xl font-semibold">最近素材</h2>
            <Link href="/admin/ideas" className="text-sm text-primary hover:underline">全部素材 →</Link>
          </div>
          <form action="/admin/ideas" className="my-4 flex gap-2">
            <Input name="q" aria-label="搜索私人素材" placeholder="搜索原文、标题或讨论摘要" maxLength={200} />
            <Button type="submit" variant="outline">搜索</Button>
          </form>
          {recent.length ? <ul className="divide-y divide-border/60">
            {recent.map((idea) => <li key={idea.id} className="py-3">
              <Link href={`/admin/ideas/${encodeURIComponent(idea.id)}`} className="block break-words font-medium hover:underline">{idea.title}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{MATERIAL_STATUS_LABELS[idea.discussionStatus]} · {idea.capturedAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
            </li>)}
          </ul> : <p className="py-5 text-sm text-muted-foreground">还没有素材，上面随手记一条就好。</p>}
        </section>
        <section aria-labelledby="resume-discussion-heading" className="rounded-xl border border-border/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="resume-discussion-heading" className="text-xl font-semibold">继续讨论</h2>
            <Link href="/admin/ideas?discussionStatus=WANT_DISCUSS" className="text-sm text-primary hover:underline">想讨论的素材 →</Link>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">只挑现在想继续的，不必把每条素材都变成任务。</p>
          {resume.length ? <ul className="mt-3 divide-y divide-border/60">
            {resume.map((idea) => <li key={idea.id} className="py-3">
              <Link href={`/admin/ideas/${encodeURIComponent(idea.id)}`} className="block break-words font-medium hover:underline">{idea.title}</Link>
              {idea.discussionSummary && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{idea.discussionSummary}</p>}
            </li>)}
          </ul> : <p className="py-5 text-sm text-muted-foreground">在素材里标记“想讨论”，下次就能从这里接上。</p>}
        </section>
      </div>
      <DailyTopThree initialDashboard={dashboard} />
      <p className="text-sm text-muted-foreground"><Link href="/admin/overview" className="hover:underline">查看统计概览</Link></p>
    </Container>
  )
}
