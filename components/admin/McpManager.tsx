"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Ban,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  KeyRound,
  Laptop,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { type McpScope } from "@/lib/mcp/scopes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type ApprovalStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED"

interface CredentialView {
  id: string
  kind: "STATIC" | "OAUTH"
  name: string
  oauthClientId: string | null
  scopes: string[]
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
  approvalCount: number
}

interface ApprovalView {
  id: string
  toolName: string
  requiredScope: string
  status: ApprovalStatus
  parameterSummary: unknown
  resultSummary: unknown
  executionError: string | null
  processingAt: string | null
  reviewedAt: string | null
  executedAt: string | null
  expiresAt: string
  createdAt: string
  credential: {
    id: string
    name: string
    revokedAt: string | null
  }
}

interface AuditLogView {
  id: string
  credentialId: string | null
  credentialName: string | null
  toolName: string
  parameterSummary: unknown
  resultSummary: unknown
  status: "IN_PROGRESS" | "SUCCESS" | "FAILURE" | "INTERRUPTED"
  success: boolean
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

const scopeLabels: Record<McpScope, string> = {
  "draft:create": "创建草稿",
  "draft:read": "查询草稿",
  "draft:update": "修改元数据",
  "category:create": "创建分类",
  "todo:convert": "Todo 转草稿",
}

const toolLabels: Record<string, string> = {
  create_draft_from_markdown: "导入 Markdown 草稿",
  "create_draft_from_markdown.prepare": "准备 Markdown 导入",
  search_drafts: "搜索草稿",
  update_draft_metadata: "修改草稿元数据",
  create_category: "创建分类",
  todo_to_draft: "Todo 转草稿",
  get_approval_status: "查询审批状态",
}

const statusLabels: Record<ApprovalStatus, string> = {
  PENDING_APPROVAL: "待审批",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "从未"
}

function shortId(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : "未知"
}

function summaryEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value).map(([key, item]) => {
    if (item === null) return [key, "空"]
    if (Array.isArray(item)) return [key, item.join(", ") || "空"]
    if (typeof item === "object") return [key, JSON.stringify(item)]
    return [key, String(item)]
  })
}

export function McpManager({
  credentials,
  approvals,
  auditLogs,
}: {
  credentials: CredentialView[]
  approvals: ApprovalView[]
  auditLogs: AuditLogView[]
}) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [credentialName, setCredentialName] = useState("")
  const [oneTimeToken, setOneTimeToken] = useState("")
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "PENDING_APPROVAL"),
    [approvals]
  )

  async function createCredential() {
    if (!credentialName.trim()) return
    setBusyKey("create")
    setError("")
    try {
      const result = await apiRequest<{ token: string }>(
        "/api/mcp/admin/credentials",
        jsonRequest("POST", { name: credentialName.trim() })
      )
      setOneTimeToken(result.token)
      setCredentialName("")
      setCreateOpen(false)
      setTokenOpen(true)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建 MCP credential 失败")
    } finally {
      setBusyKey(null)
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(oneTimeToken)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError("浏览器未允许复制，请手动选择 credential")
    }
  }

  async function revokeCredential(credential: CredentialView) {
    const effect = credential.kind === "OAUTH"
      ? "该 Agent 的授权、令牌和客户端注册会立即失效。"
      : "该本地导入器会立即无法继续上传 Markdown。"
    if (!window.confirm(`撤销“${credential.name}”？${effect}`)) return
    setBusyKey(`credential:${credential.id}`)
    setError("")
    try {
      await apiRequest(`/api/mcp/admin/credentials/${credential.id}/revoke`, { method: "POST" })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "撤销 MCP credential 失败")
    } finally {
      setBusyKey(null)
    }
  }

  async function deleteRecord(
    kind: "credential" | "approval" | "audit",
    id: string,
    label: string
  ) {
    if (!window.confirm(`永久删除${label}？此操作不可撤销。`)) return
    const endpoints = {
      credential: `/api/mcp/admin/credentials/${id}`,
      approval: `/api/mcp/admin/approvals/${id}`,
      audit: `/api/mcp/admin/audit/${id}`,
    }
    const busy = `delete:${kind}:${id}`
    setBusyKey(busy)
    setError("")
    try {
      await apiRequest(endpoints[kind], { method: "DELETE" })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `删除${label}失败`)
    } finally {
      setBusyKey(null)
    }
  }

  async function decideApproval(approval: ApprovalView, decision: "approve" | "reject") {
    let reason: string | undefined
    if (decision === "approve") {
      if (!window.confirm(`批准“${toolLabels[approval.toolName] ?? approval.toolName}”？批准后将立即在线上执行。`)) return
    } else {
      const input = window.prompt("拒绝原因（可留空）", "人工拒绝")
      if (input === null) return
      reason = input.trim() || undefined
    }

    setBusyKey(`approval:${approval.id}`)
    setError("")
    try {
      await apiRequest(
        `/api/mcp/admin/approvals/${approval.id}`,
        jsonRequest("PATCH", decision === "approve" ? { decision } : { decision, reason })
      )
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审批操作失败")
    } finally {
      setBusyKey(null)
      router.refresh()
    }
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setError("")} aria-label="关闭错误提示">
            <X className="size-4" />
          </Button>
        </div>
      )}

      <Tabs defaultValue={pendingApprovals.length > 0 ? "approvals" : "credentials"}>
        <TabsList variant="line" className="mb-5 border-b border-border">
          <TabsTrigger value="credentials">连接 {credentials.length}</TabsTrigger>
          <TabsTrigger value="approvals">审批 {pendingApprovals.length}</TabsTrigger>
          <TabsTrigger value="audit">审计 {auditLogs.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="credentials">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-medium">已连接 Agent 与本地导入器</h2>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              创建本地导入凭证
            </Button>
          </div>
          {credentials.length === 0 ? (
            <EmptyState icon={KeyRound} text="暂无 Agent 连接或本地导入器" />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">名称与方式</th>
                    <th className="px-3 py-2 font-medium">权限</th>
                    <th className="px-3 py-2 font-medium">最后使用</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {credentials.map((credential) => (
                    <tr key={credential.id}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          {credential.kind === "OAUTH" ? <Laptop className="size-4" /> : <KeyRound className="size-4" />}
                          {credential.name}
                        </div>
                        <Badge variant="outline" className="mt-1.5">
                          {credential.kind === "OAUTH" ? "OAuth Agent" : "本地 Markdown 导入"}
                        </Badge>
                        {credential.oauthClientId && (
                          <div className="mt-1 break-all font-mono text-xs text-muted-foreground" title={credential.oauthClientId}>
                            Client {shortId(credential.oauthClientId)}
                          </div>
                        )}
                        <div className="mt-1 font-mono text-xs text-muted-foreground" title={credential.id}>{shortId(credential.id)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-xl flex-wrap gap-1">
                          {credential.scopes.map((scope) => (
                            <Badge key={scope} variant="outline">
                              {scopeLabels[scope as McpScope] ?? scope}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(credential.lastUsedAt)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={credential.revokedAt ? "destructive" : "secondary"}>
                          {credential.revokedAt ? "已撤销" : "有效"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {!credential.revokedAt && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => revokeCredential(credential)}
                            disabled={busyKey === `credential:${credential.id}`}
                          >
                            <Ban className="size-3.5" />
                            撤销
                          </Button>
                          )}
                          {credential.revokedAt && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteRecord("credential", credential.id, `连接记录“${credential.name}”`)}
                              disabled={credential.approvalCount > 0 || busyKey === `delete:credential:${credential.id}`}
                              aria-label={`删除凭证 ${credential.name}`}
                              title={credential.approvalCount > 0
                                ? `仍有关联的 ${credential.approvalCount} 条审批记录`
                                : "删除连接记录"}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="approvals">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-medium">操作审批</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          </div>
          {approvals.length === 0 ? (
            <EmptyState icon={ShieldCheck} text="暂无 MCP 审批记录" />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {approvals.map((approval) => (
                <div key={approval.id} className="p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{toolLabels[approval.toolName] ?? approval.toolName}</span>
                        <ApprovalBadge status={approval.status} processing={Boolean(approval.processingAt)} />
                        {approval.credential.revokedAt && <Badge variant="destructive">凭证已撤销</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{approval.credential.name}</span>
                        <time dateTime={approval.createdAt}>{formatDate(approval.createdAt)}</time>
                        <span className="font-mono" title={approval.id}>{shortId(approval.id)}</span>
                      </div>
                    </div>
                    {approval.status === "PENDING_APPROVAL" ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => decideApproval(approval, "reject")}
                          disabled={Boolean(approval.processingAt) || busyKey === `approval:${approval.id}`}
                        >
                          <X className="size-3.5" />
                          拒绝
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => decideApproval(approval, "approve")}
                          disabled={Boolean(approval.processingAt) || Boolean(approval.credential.revokedAt) || busyKey === `approval:${approval.id}`}
                        >
                          <Check className="size-3.5" />
                          批准并执行
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteRecord("approval", approval.id, "审批记录")}
                        disabled={busyKey === `delete:approval:${approval.id}`}
                        aria-label="删除审批记录"
                        title="删除审批记录"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  <Summary value={approval.parameterSummary} />
                  {Boolean(approval.resultSummary) && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground">执行结果</p>
                      <Summary value={approval.resultSummary} />
                    </div>
                  )}
                  {approval.executionError && (
                    <p className="mt-3 break-words text-sm text-destructive">{approval.executionError}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>权限：{scopeLabels[approval.requiredScope as McpScope] ?? approval.requiredScope}</span>
                    <span>过期：{formatDate(approval.expiresAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-medium">最近 100 条操作</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          </div>
          {auditLogs.length === 0 ? (
            <EmptyState icon={Clock3} text="暂无 MCP 审计记录" />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">客户端</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                    <th className="px-3 py-2 font-medium">参数摘要</th>
                    <th className="px-3 py-2 font-medium">结果</th>
                    <th className="w-14 px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border align-top">
                  {auditLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(entry.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div>{entry.credentialName ?? "未知凭证"}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{shortId(entry.credentialId)}</div>
                      </td>
                      <td className="px-3 py-3">{toolLabels[entry.toolName] ?? entry.toolName}</td>
                      <td className="max-w-sm px-3 py-3"><Summary value={entry.parameterSummary} compact /></td>
                      <td className="px-3 py-3">
                        <Badge variant={entry.status === "SUCCESS" ? "secondary" : entry.status === "IN_PROGRESS" ? "outline" : "destructive"}>
                          {entry.status === "SUCCESS"
                            ? "成功"
                            : entry.status === "IN_PROGRESS"
                              ? "执行中"
                              : entry.status === "INTERRUPTED"
                                ? "中断"
                                : entry.errorCode ?? "失败"}
                        </Badge>
                        {entry.errorMessage && <p className="mt-1 max-w-xs break-words text-xs text-destructive">{entry.errorMessage}</p>}
                        {Boolean(entry.resultSummary) && <Summary value={entry.resultSummary} compact />}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteRecord("audit", entry.id, "审计记录")}
                          disabled={entry.status === "IN_PROGRESS" || busyKey === `delete:audit:${entry.id}`}
                          aria-label="删除审计记录"
                          title={entry.status === "IN_PROGRESS" ? "执行中的审计记录不能删除" : "删除审计记录"}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建本地 Markdown 导入凭证</DialogTitle>
            <DialogDescription>仅用于本机 stdio 导入器，固定授予创建草稿审批权限。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-credential-name">导入器名称</Label>
              <Input
                id="mcp-credential-name"
                value={credentialName}
                onChange={(event) => setCredentialName(event.target.value)}
                placeholder="例如：主电脑 Markdown 导入"
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <span>{scopeLabels["draft:create"]}</span>
              <code className="ml-auto text-xs text-muted-foreground">draft:create</code>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              type="button"
              onClick={createCredential}
              disabled={busyKey === "create" || !credentialName.trim()}
            >
              <KeyRound className="size-4" />
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tokenOpen}
        onOpenChange={(open) => {
          setTokenOpen(open)
          if (!open) {
            setOneTimeToken("")
            setCopied(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>本地导入 credential 仅显示一次</DialogTitle>
            <DialogDescription>关闭后无法再次查看，只能撤销并重新创建。</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 items-stretch gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-muted/50 p-3 text-xs leading-5">
              {oneTimeToken}
            </code>
            <Button type="button" variant="outline" size="icon" onClick={copyToken} aria-label="复制 credential" title="复制 credential">
              {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTokenOpen(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ApprovalBadge({ status, processing }: { status: ApprovalStatus; processing: boolean }) {
  if (processing) return <Badge variant="secondary"><RefreshCw className="size-3 animate-spin" />执行中</Badge>
  if (status === "APPROVED") return <Badge variant="secondary"><CheckCircle2 className="size-3" />{statusLabels[status]}</Badge>
  if (status === "REJECTED") return <Badge variant="destructive"><XCircle className="size-3" />{statusLabels[status]}</Badge>
  return <Badge variant="outline"><Clock3 className="size-3" />{statusLabels[status]}</Badge>
}

function Summary({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const entries = summaryEntries(value)
  if (entries.length === 0) return compact ? <span className="text-muted-foreground">无</span> : null
  return (
    <dl className={compact ? "space-y-1 text-xs" : "mt-3 grid gap-x-6 gap-y-2 rounded-md bg-muted/40 px-3 py-2 text-sm sm:grid-cols-2"}>
      {entries.map(([key, item]) => (
        <div key={key} className="min-w-0">
          <dt className="inline text-muted-foreground">{key}：</dt>
          <dd className="inline break-all">{item}</dd>
        </div>
      ))}
    </dl>
  )
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof KeyRound
  text: string
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
      <Icon className="mb-2 size-5" />
      <p className="text-sm">{text}</p>
    </div>
  )
}
