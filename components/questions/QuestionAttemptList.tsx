import { Badge } from "@/components/ui/badge"
import { QuestionMarkdown } from "@/components/questions/QuestionMarkdown"
import {
  formatQuestionDateTime,
  ratingBilingualLabels,
  ratingLabels,
  type QuestionAttempt,
  type QuestionTimelineItem,
} from "@/components/questions/types"

function modeLabel(mode: QuestionAttempt["mode"] | null | undefined) {
  return mode === "DIRECT_REVEAL" ? "直接揭晓" : "作答"
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    CONTENT_RESET: "内容修改后重置为新题",
    ANSWER_CLEARED: "清空标准答案并退出队列",
    ANSWER_COMPLETED: "补全标准答案并进入队列",
  }
  return labels[reason] ?? reason
}

export function QuestionAttemptList({ attempts }: { attempts: QuestionAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有作答记录。</p>
  }

  return (
    <div className="space-y-3">
      {attempts.map((attempt) => (
        <article key={attempt.id} className="rounded-lg border border-border/70 bg-background p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{modeLabel(attempt.mode)}</Badge>
            <Badge variant="secondary">{ratingLabels[attempt.rating]}</Badge>
            <time dateTime={attempt.createdAt}>{formatQuestionDateTime(attempt.createdAt)}</time>
          </div>
          {attempt.answerMarkdown ? (
            <QuestionMarkdown markdown={attempt.answerMarkdown} className="prose-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {attempt.mode === "DIRECT_REVEAL" ? "直接揭晓不保存答案正文。" : "这条答案正文已按保留规则淘汰。"}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

export function QuestionTimeline({ items }: { items: QuestionTimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有时间线记录。</p>
  }

  return (
    <ol className="space-y-0 border-l border-border/80 pl-5">
      {items.map((item) => {
        const eventType = item.type || item.kind || (item.rating ? "REVIEW" : "EVENT")
        const occurredAt = item.at ?? item.createdAt
        return (
          <li key={item.id} className="relative pb-6 last:pb-0">
            <span className="absolute -left-[1.55rem] top-1.5 size-2 rounded-full bg-primary ring-4 ring-background" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {eventType === "REVIEW" ? "完成复习" : eventType === "RESET" ? "重置排程" : eventType}
              </span>
              {item.rating && <Badge variant="secondary">{ratingBilingualLabels[item.rating]}</Badge>}
              {item.mode && <Badge variant="outline">{modeLabel(item.mode)}</Badge>}
            </div>
            <time className="mt-1 block text-xs text-muted-foreground" dateTime={occurredAt}>
              {formatQuestionDateTime(occurredAt)}
            </time>
            {item.reason && <p className="mt-2 text-sm text-muted-foreground">{reasonLabel(item.reason)}</p>}
            {(item.stateBefore || item.stateAfter || item.beforeDueAt || item.afterDueAt || item.reviewRevision !== undefined) && (
              <dl className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
                {(item.stateBefore || item.stateAfter) && (
                  <div>
                    <dt className="text-muted-foreground">状态迁移</dt>
                    <dd className="mt-0.5 font-medium">
                      {item.stateBefore ?? "—"} → {item.stateAfter ?? "—"}
                    </dd>
                  </div>
                )}
                {item.reviewRevision !== undefined && item.reviewRevision !== null && (
                  <div>
                    <dt className="text-muted-foreground">评分修订次数</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{item.reviewRevision}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">原到期时间</dt>
                  <dd className="mt-0.5 font-medium">{formatQuestionDateTime(item.beforeDueAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">新到期时间</dt>
                  <dd className="mt-0.5 font-medium">{formatQuestionDateTime(item.afterDueAt)}</dd>
                </div>
              </dl>
            )}
            {item.answerMarkdown && (
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <QuestionMarkdown markdown={item.answerMarkdown} className="prose-sm" />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
