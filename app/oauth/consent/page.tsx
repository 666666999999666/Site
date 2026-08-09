import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { ExternalLink, MonitorCog, ShieldCheck } from "lucide-react"
import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm"
import { auth } from "@/lib/auth/better-auth"
import {
  firstOAuthParam,
  validateOAuthPageRequest,
  type OAuthPageSearchParams,
} from "@/lib/auth/oauth-request"
import { MCP_SCOPES } from "@/lib/mcp/scopes"

export const metadata: Metadata = { title: "确认 Agent 权限" }

const SCOPE_LABELS: Record<string, string> = {
  "draft:create": "创建博客草稿审批",
  "draft:read": "搜索草稿与文章元数据",
  "draft:update": "提交草稿元数据修改审批",
  "category:create": "提交新建分区审批",
  "todo:convert": "提交 Todo 转草稿审批",
  offline_access: "保持连接并自动刷新短期令牌",
}

function callbackHost(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return "未知回调地址"
  }
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<OAuthPageSearchParams>
}) {
  const values = await searchParams
  const request = await validateOAuthPageRequest(values)
  if (!request) notFound()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect(`/oauth/sign-in?${request.oauthQuery}`)

  const requestedScopes = firstOAuthParam(values.scope)
    .split(/\s+/)
    .filter((scope) => MCP_SCOPES.includes(scope as (typeof MCP_SCOPES)[number]) || scope === "offline_access")
  const redirectHost = callbackHost(firstOAuthParam(values.redirect_uri))
  const internalName = typeof request.client.name === "string" ? request.client.name : ""
  const clientName = request.client.client_name?.trim() || internalName.trim() || "未命名 Agent"

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:py-16">
      <section className="mx-auto w-full max-w-xl">
        <header className="border-b border-border pb-7">
          <div className="mb-5 flex size-12 items-center justify-center rounded-md bg-foreground text-background">
            <MonitorCog className="size-6" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Agent 连接请求</p>
          <h1 className="mt-1 break-words text-2xl font-semibold">{clientName}</h1>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="size-4" />
            <span className="break-all">回调到 {redirectHost}</span>
          </div>
        </header>

        <div className="py-7">
          <h2 className="text-base font-semibold">申请权限</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {requestedScopes.map((scope) => (
              <li key={scope} className="flex items-start gap-3 py-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p>{SCOPE_LABELS[scope] ?? scope}</p>
                  <code className="text-xs text-muted-foreground">{scope}</code>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            此授权只允许 Agent 提交操作请求。每次写操作仍需在博客后台单独批准，且不能发布或删除文章。
          </p>
        </div>

        <OAuthConsentForm oauthQuery={request.oauthQuery} />
      </section>
    </main>
  )
}
