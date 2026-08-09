import { Container } from "@/components/layout/Container"
import { McpManager } from "@/components/admin/McpManager"
import { listMcpApprovals } from "@/lib/mcp/approval-service"
import { listMcpAuditLogs } from "@/lib/mcp/audit-service"
import { listMcpCredentials } from "@/lib/mcp/credential-service"
import { runMcpMaintenance } from "@/lib/mcp/maintenance-service"

export default async function McpPage() {
  await runMcpMaintenance().catch((error) => console.error("[MCP maintenance failure]", error))
  const [credentials, approvals, auditLogs] = await Promise.all([
    listMcpCredentials(),
    listMcpApprovals({ limit: 100 }),
    listMcpAuditLogs({ limit: 100 }),
  ])

  return (
    <Container size="wide">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">MCP 管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            已连接 Agent、本地导入器、人工审批与操作审计
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {approvals.filter((approval) => approval.status === "PENDING_APPROVAL").length} 项待审批
        </span>
      </div>

      <McpManager
        credentials={credentials.map((credential) => ({
          id: credential.id,
          kind: credential.kind,
          name: credential.name,
          oauthClientId: credential.oauthClientId,
          scopes: credential.scopes,
          revokedAt: credential.revokedAt?.toISOString() ?? null,
          lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
          createdAt: credential.createdAt.toISOString(),
          approvalCount: credential._count.approvals,
        }))}
        approvals={approvals.map((approval) => ({
          ...approval,
          processingAt: approval.processingAt?.toISOString() ?? null,
          reviewedAt: approval.reviewedAt?.toISOString() ?? null,
          executedAt: approval.executedAt?.toISOString() ?? null,
          expiresAt: approval.expiresAt.toISOString(),
          createdAt: approval.createdAt.toISOString(),
          credential: {
            ...approval.credential,
            revokedAt: approval.credential.revokedAt?.toISOString() ?? null,
          },
        }))}
        auditLogs={auditLogs.map((entry) => ({
          id: entry.id,
          credentialId: entry.credentialId,
          credentialName: entry.credential?.name ?? null,
          toolName: entry.toolName,
          parameterSummary: entry.parameterSummary,
          resultSummary: entry.resultSummary,
          status: entry.status,
          success: entry.success,
          errorCode: entry.errorCode,
          errorMessage: entry.errorMessage,
          createdAt: entry.createdAt.toISOString(),
          completedAt: entry.completedAt?.toISOString() ?? null,
        }))}
      />
    </Container>
  )
}
