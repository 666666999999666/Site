import Link from "next/link"
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Flame } from "lucide-react"
import { ensureAuthenticated } from "@/lib/api/auth"
import {
  databaseDateToKey,
  formatChineseDate,
  getShanghaiMonthKey,
  parseMonthKey,
} from "@/lib/daily-date"
import { getDailyHistory } from "@/lib/daily"
import { parseDailyMonthQuery } from "@/lib/daily-validation"
import { cn } from "@/lib/utils"
import { Container } from "@/components/layout/Container"
import { buttonVariants } from "@/components/ui/button"

function shiftMonth(monthKey: string, offset: number): string {
  const { year, month } = parseMonthKey(monthKey)
  return databaseDateToKey(new Date(Date.UTC(year, month - 1 + offset, 1))).slice(0, 7)
}

function monthLabel(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey)
  return `${year}年${month}月`
}

function weekday(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

export default async function DailyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await ensureAuthenticated()
  const query = await searchParams
  const currentMonth = getShanghaiMonthKey()
  const month = parseDailyMonthQuery(query.month ?? null, currentMonth)
  const history = await getDailyHistory(session.userId, month)
  const previousMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)
  const canMovePrevious = previousMonth >= "2000-01"
  const canMoveNext = nextMonth <= currentMonth

  return (
    <Container className="max-w-4xl">
      <header className="border-b border-border/60 pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              每日三件事
            </p>
            <h1 className="text-3xl font-semibold">历史记录</h1>
          </div>
          <div className="flex items-center gap-2">
            {canMovePrevious ? (
              <Link
                href={`/admin/daily/history?month=${previousMonth}`}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11")}
                aria-label="上个月"
                title="上个月"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : (
              <span
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11 cursor-not-allowed opacity-40")}
                aria-disabled="true"
              >
                <ChevronLeft className="size-4" />
              </span>
            )}
            <div className="flex h-11 min-w-32 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium">
              {monthLabel(month)}
            </div>
            {canMoveNext ? (
              <Link
                href={`/admin/daily/history?month=${nextMonth}`}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11")}
                aria-label="下个月"
                title="下个月"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-11 cursor-not-allowed opacity-40")}
                aria-disabled="true"
              >
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        </div>

        <div className="mt-7 grid gap-px bg-border/60 sm:grid-cols-3">
          <div className="bg-background py-4 pr-5 sm:px-5 sm:first:pl-0">
            <p className="text-2xl font-semibold tabular-nums">{history.stats.completedDays} 天</p>
            <p className="mt-1 text-sm text-muted-foreground">完整完成</p>
          </div>
          <div className="bg-background px-0 py-4 sm:px-5">
            <p className="text-2xl font-semibold tabular-nums">{history.stats.averageProgress}%</p>
            <p className="mt-1 text-sm text-muted-foreground">平均完成度</p>
          </div>
          <div className="flex items-start gap-3 bg-background py-4 pl-0 sm:px-5 sm:last:pr-0">
            <Flame className="mt-1 size-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{history.stats.streak} 天</p>
              <p className="mt-1 text-sm text-muted-foreground">当前连续完成</p>
            </div>
          </div>
        </div>
      </header>

      {history.days.length === 0 ? (
        <div className="py-20 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-4 text-sm text-muted-foreground">这个月还没有记录</p>
        </div>
      ) : (
        <div className="space-y-4 py-7">
          {history.days.map((day) => (
            <article key={day.date} className="rounded-lg border border-border/70 bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-medium">{formatChineseDate(day.date)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{weekday(day.date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${day.progress}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm font-medium tabular-nums">{day.progress}%</span>
                </div>
              </div>

              <ol className="mt-4 space-y-3">
                {day.tasks.map((task) => (
                  <li key={task.slot} className="flex min-w-0 items-start gap-3">
                    <span className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border",
                      task.completed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    )}>
                      {task.completed ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                    </span>
                    <span className={cn(
                      "min-w-0 break-words leading-6",
                      !task.title && "text-muted-foreground/60",
                      task.completed && "text-muted-foreground line-through"
                    )}>
                      {task.title || "未填写"}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-5 border-t border-border/60 pt-4 text-sm leading-6 text-muted-foreground">
                {day.quote.quote}
              </p>
            </article>
          ))}
        </div>
      )}
    </Container>
  )
}
