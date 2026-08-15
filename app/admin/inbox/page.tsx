import { Container } from "@/components/layout/Container"
import { InboxManager } from "@/components/admin/InboxManager"
import { ensureAuthenticated } from "@/lib/api/auth"
import { prisma } from "@/lib/db"
import { isInboxEnabled } from "@/lib/inbox-feature"
import { serializeInboxSummary } from "@/lib/inbox-view"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  const { userId } = await ensureAuthenticated()
  if (!isInboxEnabled()) {
    return (
      <Container>
        <h1 className="mb-3 text-3xl font-semibold">智能收件箱</h1>
        <p className="max-w-2xl text-muted-foreground">
          此功能当前已关闭。部署者可通过 INBOX_ENABLED=true 启用确定性的前缀分流。
        </p>
      </Container>
    )
  }

  const items = await prisma.inboxItem.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      status: true,
      failureCode: true,
      failureMessage: true,
      createdAt: true,
      appliedAt: true,
      updatedAt: true,
      execution: true,
    },
  })

  return (
    <Container>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">智能收件箱</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          使用普通代码识别 idea、文章和 todo 前缀，立即保存原文并分流，不会调用 LLM 或抓取网址。
        </p>
      </div>
      <InboxManager initialItems={items.map(serializeInboxSummary)} />
    </Container>
  )
}
