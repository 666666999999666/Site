import "dotenv/config"
import { disconnectDatabase } from "../lib/db"
import { approveMcpApproval, listMcpApprovals, rejectMcpApproval } from "../lib/mcp/approval-service"
import { listMcpAuditLogs } from "../lib/mcp/audit-service"
import {
  createMcpCredential,
  listMcpCredentials,
  MCP_SCOPES,
  revokeMcpCredential,
} from "../lib/mcp/credential-service"

const args = process.argv.slice(2)

function option(name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

function requiredOption(name: string): string {
  const value = option(name)?.trim()
  if (!value) throw new Error(`缺少 --${name}`)
  return value
}

function numericOption(name: string, fallback: number): number {
  const raw = option(name)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} 必须是正整数`)
  return value
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function usage(): never {
  throw new Error([
    "用法：",
    "  npm run mcp:admin -- credential create --name <client> --scopes <scope,...>",
    "  npm run mcp:admin -- credential list",
    "  npm run mcp:admin -- credential revoke --id <credential-id>",
    "  npm run mcp:admin -- approval list [--status pending_approval|approved|rejected] [--limit 50]",
    "  npm run mcp:admin -- approval approve --id <approval-id>",
    "  npm run mcp:admin -- approval reject --id <approval-id> [--reason <reason>]",
    "  npm run mcp:admin -- audit list [--credential <id>] [--tool <name>] [--limit 50]",
    `可用 scopes：${MCP_SCOPES.join(", ")}`,
  ].join("\n"))
}

function approvalStatus(value: string | undefined) {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  if (!["PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(normalized)) {
    throw new Error("--status 必须是 pending_approval、approved 或 rejected")
  }
  return normalized as "PENDING_APPROVAL" | "APPROVED" | "REJECTED"
}

async function main() {
  const [resource, action] = args
  if (resource === "credential" && action === "create") {
    const scopes = requiredOption("scopes").split(",").map((scope) => scope.trim()).filter(Boolean)
    const result = await createMcpCredential(requiredOption("name"), scopes)
    print({
      ...result,
      warning: "token 只显示这一次；请立即写入对应 MCP client 的私密环境配置。",
    })
    return
  }
  if (resource === "credential" && action === "list") {
    print(await listMcpCredentials())
    return
  }
  if (resource === "credential" && action === "revoke") {
    print(await revokeMcpCredential(requiredOption("id")))
    return
  }
  if (resource === "approval" && action === "list") {
    print(await listMcpApprovals({
      status: approvalStatus(option("status")),
      limit: numericOption("limit", 50),
    }))
    return
  }
  if (resource === "approval" && action === "approve") {
    print(await approveMcpApproval(requiredOption("id")))
    return
  }
  if (resource === "approval" && action === "reject") {
    print(await rejectMcpApproval(requiredOption("id"), option("reason")))
    return
  }
  if (resource === "audit" && action === "list") {
    print(await listMcpAuditLogs({
      credentialId: option("credential"),
      toolName: option("tool"),
      limit: numericOption("limit", 50),
    }))
    return
  }
  usage()
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDatabase()
  })
