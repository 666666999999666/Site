# 本地 stdio MCP 使用说明

## 1. 能力与边界

`qz-blog-drafts` 是由 Claude Desktop、Cursor 等客户端在本机拉起的 stdio MCP Server。它只提供以下 tools：

| Tool | Scope | 行为 |
|---|---|---|
| `create_draft_from_markdown` | `draft:create` | 校验并搬运本地 Markdown 与图片，审批后创建草稿 |
| `search_drafts` | `draft:read` | 按标题、关键词、标签、分区、状态搜索，默认只查草稿 |
| `update_draft_metadata` | `draft:update` | 审批后修改标题、描述、标签、分区、封面和 draft metadata |
| `create_category` | `category:create` | 审批后创建 BLOG/TODO 分区 |
| `todo_to_draft` | `todo:convert` | 审批后把 Todo 已有标题与描述复制为草稿 |

Server 没有发布、删除或生成正文工具。搜索结果只返回 metadata 和最多 240 字的纯文本摘要，不返回完整正文。

## 2. 初始化数据库

使用 Node.js 22，并确保依赖与 Prisma Client 已生成：

```bash
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
```

Migration 会新增 MCP credential、审批、审计、限流表，并为文章增加 `coverImage` 与 `draftMetadata`。

Web 应用部署会携带并执行该 migration，但 stdio Server 本身不会进入生产 Web 镜像。Claude Desktop/Cursor 仍从受信本机启动它，并通过配置的 `DATABASE_URL` 访问目标数据库。

## 3. 为每个 Client 创建 Credential

每个客户端单独执行一次，不能共用 token：

```bash
npm run mcp:admin -- credential create --name claude-desktop --scopes draft:create,draft:read,draft:update,category:create,todo:convert
npm run mcp:admin -- credential create --name cursor --scopes draft:create,draft:read,draft:update,category:create,todo:convert
```

命令只在创建时显示一次完整 token。数据库仅保存 scrypt hash；token 丢失后应撤销旧 credential 并重新创建。

```bash
npm run mcp:admin -- credential list
npm run mcp:admin -- credential revoke --id <credential-id>
```

撤销会在客户端下一次 tool 调用时生效，即使 MCP 进程仍在运行。

## 4. Client 私密环境文件

分别创建被 Git 忽略的 `.env.mcp.claude.local` 与 `.env.mcp.cursor.local`：

```dotenv
DATABASE_URL="postgresql://postgres:password@localhost:5432/blog?schema=public"
BLOG_MCP_CREDENTIAL="qzmcp_v1_<credential-id>_<secret>"
MCP_MARKDOWN_ROOT="C:/Users/you/Documents/blog-drafts"
MCP_IMAGE_ROOT="C:/Users/you/Documents/blog-drafts"
UPLOAD_DIR="C:/Users/you/site/public/uploads"
MCP_APPROVAL_TTL_HOURS=24
MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE=60
MCP_SEARCH_RATE_LIMIT_PER_MINUTE=30
MCP_WRITE_RATE_LIMIT_PER_MINUTE=10
```

两个文件的 `BLOG_MCP_CREDENTIAL` 必须不同。`MCP_MARKDOWN_ROOT` 是 Markdown 沙箱；`MCP_IMAGE_ROOT` 是可读取本地图片的沙箱。默认值都是仓库内的 `drafts/`。`UPLOAD_DIR` 必须指向与该 `DATABASE_URL` 对应站点实际使用的上传卷；省略时使用仓库的 `public/uploads/`。数据库指向远程环境但上传目录仍在本机，会造成图片 URL 在远程站点不可用，因此这种组合不应使用。

## 5. Claude Desktop 配置

Windows 下直接运行 `node.exe` 和本项目的 `tsx` CLI，避免通过 `npm run` 向 stdout 写入提示文字并破坏 stdio JSON-RPC。把下列内容加入 Claude Desktop 的 `claude_desktop_config.json`，所有路径换成真实绝对路径：

```json
{
  "mcpServers": {
    "qz-blog": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\you\\site\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Users\\you\\site\\mcp\\server.ts"
      ],
      "env": {
        "DOTENV_CONFIG_PATH": "C:\\Users\\you\\site\\.env.mcp.claude.local"
      }
    }
  }
}
```

重启 Claude Desktop 后检查 `qz-blog` 是否列出五个 tools。

## 6. Cursor 配置

在 Cursor 用户配置或项目的 `.cursor/mcp.json` 中加入：

```json
{
  "mcpServers": {
    "qz-blog": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\you\\site\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Users\\you\\site\\mcp\\server.ts"
      ],
      "env": {
        "DOTENV_CONFIG_PATH": "C:\\Users\\you\\site\\.env.mcp.cursor.local"
      }
    }
  }
}
```

## 7. Markdown 导入规则

- 只接受 `.md` 与 `.markdown`。
- 文件最大 2MB，真实路径必须位于 `MCP_MARKDOWN_ROOT` 内。
- 相对图片真实路径必须位于 `MCP_IMAGE_ROOT` 内；`..`、绝对路径、符号链接越界和 `file:`/`data:` 等协议会被拒绝。
- 本地图片只允许 JPG、PNG、GIF、WebP，按文件签名判断且单张最大 5MB。
- 本地图片审批后复制到 `public/uploads`，Markdown 引用改写为 `/uploads/...`；远程 HTTP(S) 图片和合法的现有 `/uploads/...` 引用保持不变。
- frontmatter 从正文中分离：`title`、`description/excerpt`、`tags`、`category/categoryId`、`cover/coverImage` 映射到文章字段，完整解析结果保存在 `draftMetadata`。
- Markdown 正文除本地图片目标地址外不重写，因此 Mermaid fenced code、KaTeX、代码块及普通 Markdown 保持原样。

发起审批时只保存来源文件路径、SHA-256 和图片摘要，不把 Markdown 正文写入审批或审计日志。执行审批时会重新读取并比较摘要；文件或图片发生变化会拒绝执行，必须重新发起请求。

## 8. 人工审批

所有写 tools 首先返回 `pending_approval` 与 `approval_id`，不会立即修改业务数据。

```bash
npm run mcp:admin -- approval list --status pending_approval
npm run mcp:admin -- approval approve --id <approval-id>
npm run mcp:admin -- approval reject --id <approval-id> --reason "metadata 不正确"
```

审批默认 24 小时过期。批准时会再次检查 credential 未撤销且仍持有所需 scope。执行失败的请求保持待审批状态并记录错误，可修复原因后重试或人工拒绝。每次批准还会写入以审批 ID 为主键的幂等执行记录；业务写入与该记录处于同一数据库事务，进程中断后的重试不会重复创建文章、分区或 Todo 草稿。图片文件与 PostgreSQL 无法组成同一事务，正常失败会立即删除本次文件；进程在两者之间被强制终止时可能留下孤儿图片，由现有 `npm run uploads:cleanup` 在保护期后报告和清理。

## 9. 审计与限流

每次 MCP tool 调用，以及审批执行/拒绝，都会记录 credential ID、tool、时间、参数摘要、结果摘要、成功状态和错误。审计不记录 Markdown 正文或 token。

```bash
npm run mcp:admin -- audit list --limit 50
npm run mcp:admin -- audit list --credential <credential-id> --tool search_drafts --limit 100
```

限流使用 PostgreSQL 固定分钟窗口，同时维护 credential 总量桶和 credential+tool 桶。默认每个 credential 60 次/分钟、搜索 30 次/分钟、单个写 tool 10 次/分钟，可通过环境变量下调。

## 10. 本地启动诊断

配置好 `DOTENV_CONFIG_PATH` 后可以直接验证启动；stdio Server 启动后等待 JSON-RPC 输入属于正常现象：

```powershell
$env:DOTENV_CONFIG_PATH="C:\Users\you\site\.env.mcp.claude.local"
node .\node_modules\tsx\dist\cli.mjs .\mcp\server.ts
```

Server 只把协议消息写到 stdout，诊断信息写到 stderr。
