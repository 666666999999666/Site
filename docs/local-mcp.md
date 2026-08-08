# 线上博客 stdio MCP 使用说明

## 1. 架构与边界

`qz-blog-drafts` 由 Claude Desktop、Cursor 等客户端在本机拉起。它通过 HTTPS 网关操控线上博客，数据路径为：

```text
本地 MCP Client -> 本地 stdio Server -> https://liaoqizai.site/api/mcp/gateway
                 -> 线上业务 Service -> PostgreSQL / 上传卷
```

本机 Server 只读取允许目录内的 Markdown 和图片，不连接生产 PostgreSQL，不接触生产上传卷。线上网关复用网站现有文章、分类、Todo、校验和数据库访问层。

| Tool | Scope | 行为 |
|---|---|---|
| `create_draft_from_markdown` | `draft:create` | 上传本地 Markdown 与引用图片，审批后创建线上草稿 |
| `search_drafts` | `draft:read` | 按标题、关键词、标签、分区、状态查询线上文章 |
| `update_draft_metadata` | `draft:update` | 审批后修改草稿标题、描述、标签、分区、封面和 metadata |
| `create_category` | `category:create` | 审批后创建 BLOG/TODO 分区 |
| `todo_to_draft` | `todo:convert` | 审批后把线上 Todo 的已有内容复制为草稿 |

MCP 没有生成正文、发布文章或删除数据的工具。搜索只返回 metadata 和最多 240 字的纯文本摘要，不返回完整正文。

## 2. 部署前提

线上应用必须先部署包含 MCP 网关和对应 Prisma migration 的版本：

```bash
npx prisma migrate deploy
```

生产 Web 容器负责执行 migration。远程 MCP Client 不执行 migration，也不配置 `DATABASE_URL`。

## 3. 创建独立 Credential

登录博客后台，打开 `/admin/mcp`，选择“新建凭证”。每个客户端分别创建，例如：

- `Cursor - 主电脑`
- `Claude Desktop - 主电脑`

按客户端实际用途勾选最小权限。完整 credential 只显示一次，线上数据库仅保存 scrypt hash。credential 丢失后应在同一页面撤销并重新创建；撤销会在下一次请求立即生效。

本地开发或生产应急维护仍可在能访问对应数据库的受信环境中使用 `npm run mcp:admin`，日常线上使用不需要该命令。

## 4. 本机私密配置

为不同客户端创建不同的、已被 Git 忽略的环境文件，例如 `.env.mcp.cursor.local`：

```dotenv
MCP_REMOTE_URL="https://liaoqizai.site"
BLOG_MCP_CREDENTIAL="qzmcp_v1_<credential-id>_<secret>"
MCP_MARKDOWN_ROOT="C:/Users/you/Documents/blog-drafts"
MCP_IMAGE_ROOT="C:/Users/you/Documents/blog-drafts"
```

远程模式不配置 `DATABASE_URL` 或 `UPLOAD_DIR`。`MCP_MARKDOWN_ROOT` 是 Markdown 沙箱，`MCP_IMAGE_ROOT` 是图片沙箱；默认均为仓库内的 `drafts/`。

## 5. Cursor 配置

在 Cursor 用户配置或项目 `.cursor/mcp.json` 中加入：

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

重启 Cursor 后，`qz-blog` 应列出五个 tools。

## 6. Claude Desktop 配置

Windows 下直接运行 `node.exe` 和项目的 `tsx` CLI，避免 `npm run` 的额外 stdout 内容破坏 stdio JSON-RPC：

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

Claude Desktop 与 Cursor 必须使用不同 credential。

## 7. Markdown 导入规则

- 只接受 `.md` 与 `.markdown`，单文件最大 2MB。
- Markdown 真实路径必须位于 `MCP_MARKDOWN_ROOT` 内。
- 相对图片必须位于 `MCP_IMAGE_ROOT` 内；拒绝 `..` 越界、符号链接越界、绝对路径以及 `file:`、`data:` 等协议。
- 本地图片只允许 JPG、PNG、GIF、WebP，按文件签名判断；单张最大 5MB、单篇最多 50 张、总计最大 50MB。
- 本地图片通过私有暂存区上传，Nginx 禁止公开访问；批准后才写入正式 `/uploads/`。
- frontmatter 的 `title`、`description/excerpt`、`tags`、`category/categoryId`、`cover/coverImage` 映射到文章字段，完整 JSON 结果保存到 `draftMetadata`。
- 除本地图片目标地址外，正文保持原样，因此 Mermaid、KaTeX、代码块和普通 Markdown 都会保留。

Markdown 正文不会进入审批记录或审计日志。远程导入会把正文暂存在生产上传卷的私有目录，批准、拒绝或过期后清理。

## 8. 人工审批

`search_drafts` 查询会立即返回结果。其他写 tools 只返回：

```json
{
  "status": "pending_approval",
  "approval_id": "...",
  "expires_at": "..."
}
```

登录 `/admin/mcp` 查看参数摘要，选择“批准并执行”或“拒绝”。批准后才会真正创建草稿、修改 metadata、创建分区或转换 Todo。审批默认 24 小时过期。

每项批准都有以审批 ID 为主键的幂等执行记录。网络重试或进程中断不会重复创建业务数据；无法确认数据库事务状态时会优先保留图片，再由现有孤儿上传清理流程处理。

## 9. 审计与限流

每次 tool 调用及审批执行/拒绝都会记录 credential ID、tool、时间、参数摘要、结果摘要、成功状态和错误。审计不记录 Markdown 正文、credential 或 upload token，可在 `/admin/mcp` 的“审计”标签页查看最近 100 条。

线上默认限制：

- 每个 credential 总计 60 次/分钟。
- 搜索 tool 30 次/分钟。
- 单个写 tool 10 次/分钟。

生产环境可通过 `MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE`、`MCP_SEARCH_RATE_LIMIT_PER_MINUTE`、`MCP_WRITE_RATE_LIMIT_PER_MINUTE` 与 `MCP_APPROVAL_TTL_HOURS` 调整。Client 不能覆盖线上治理参数。

## 10. 本地诊断

```powershell
$env:DOTENV_CONFIG_PATH="C:\Users\you\site\.env.mcp.cursor.local"
node .\node_modules\tsx\dist\cli.mjs .\mcp\server.ts
```

看到 `QZ Blog MCP Server running on stdio` 后持续等待输入属于正常现象。Server 只把 JSON-RPC 协议写到 stdout，诊断信息写到 stderr。
