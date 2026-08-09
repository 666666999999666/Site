# 博客 MCP 使用说明

## 1. 当前架构

线上工具使用 **OAuth 2.1 + Streamable HTTP**。Cursor、Claude、Trae 等客户端只配置一个 URL，首次连接时由浏览器完成管理员登录与 Agent 授权：

```text
Cursor / Claude / Trae
        -> https://liaoqizai.site/api/mcp
        -> OAuth 登录与授权确认
        -> 现有业务 Service -> PostgreSQL
```

只有导入电脑上的 Markdown 和图片时才启动本地 stdio 导入器，因为远程服务器不能读取本机文件：

```text
MCP Client -> 本地 stdio 导入器
           -> https://liaoqizai.site/api/mcp/gateway/imports
           -> 私有暂存区 -> 人工审批 -> 草稿
```

| Tool | 入口 | 行为 |
|---|---|---|
| `search_drafts` | 远程 OAuth MCP | 按标题、关键词、标签、分区、状态查询文章 |
| `update_draft_metadata` | 远程 OAuth MCP | 审批后修改草稿 metadata，不修改正文 |
| `create_category` | 远程 OAuth MCP | 审批后创建 BLOG/TODO 分区 |
| `todo_to_draft` | 远程 OAuth MCP | 审批后搬运 Todo 已有内容，不生成正文 |
| `get_approval_status` | 远程 OAuth MCP | 查询当前 Agent 自己的审批结果、失败原因和最终 `post_id` |
| `create_draft_from_markdown` | 本地 stdio | 读取本机 Markdown/图片并上传为待审批导入 |

MCP 不提供正文生成、发布或删除文章的工具。OAuth Consent 只决定某个 Agent 可以请求哪些能力；每个写操作仍必须在博客后台单独审批。

## 2. 远程 OAuth 配置

### Cursor 与 Trae

支持远程 MCP URL 的客户端使用：

```json
{
  "mcpServers": {
    "qz-blog": {
      "url": "https://liaoqizai.site/api/mcp"
    }
  }
}
```

部分客户端要求显式写 `"type": "http"` 或 `"type": "streamable-http"`，其余配置不变。不要添加固定 `Authorization` Header。

### Claude Desktop / Claude 网页版

在 **Settings -> Connectors -> Add custom connector** 中填写：

```text
https://liaoqizai.site/api/mcp
```

### Claude Code

```bash
claude mcp add --transport http qz-blog https://liaoqizai.site/api/mcp
```

### 首次连接流程

1. 客户端通过 DCR 注册独立的公开 OAuth Client。
2. 浏览器打开博客授权页，只输入现有管理员密码。
3. 页面展示 Agent 名称、回调域名和申请的 scope。
4. 确认后客户端获得 15 分钟 Access Token 与可轮换的 30 天 Refresh Token。
5. 后台 `/admin/mcp` 会显示这个 Agent，可独立撤销、审计和限流。

每个 Agent 都应单独连接。撤销一个 Agent 会立即阻止它访问 MCP，不影响其他 Agent。远程 `/api/mcp` 不接受 `qzmcp_v1_...` 固定凭证。

## 3. 本地 Markdown 导入

先在 `/admin/mcp` 点击“创建本地 Markdown 导入凭证”。该凭证固定只有 `draft:create`，完整值只显示一次，数据库只保存 scrypt Hash。

在项目根目录创建被 Git 忽略的 `.env.mcp.local`：

```dotenv
MCP_REMOTE_URL="https://liaoqizai.site"
BLOG_MCP_CREDENTIAL="qzmcp_v1_<credential-id>_<secret>"
MCP_MARKDOWN_ROOT="C:/Users/you/Documents/blog-drafts"
MCP_IMAGE_ROOT="C:/Users/you/Documents/blog-drafts"
```

项目不会提交 `.env.mcp.local` 或 `.env.mcp.claude.local`，因为其中包含真实凭证。配置本地 server：

```json
{
  "mcpServers": {
    "qz-blog-local-import": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\you\\site\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Users\\you\\site\\mcp\\server.ts"
      ],
      "env": {
        "DOTENV_CONFIG_PATH": "C:\\Users\\you\\site\\.env.mcp.local"
      }
    }
  }
}
```

本地 server 只暴露 `create_draft_from_markdown`，不代理搜索、metadata、分类或 Todo 工具，也不连接生产数据库。

## 4. Markdown 安全规则

- 只接受 `.md` 与 `.markdown`，单文件最大 2MB。
- Markdown 真实路径必须位于 `MCP_MARKDOWN_ROOT` 内。
- 相对图片必须位于 `MCP_IMAGE_ROOT` 内；拒绝 `..` 越界、符号链接越界、绝对路径以及 `file:`、`data:` 等协议。
- 图片只允许 JPG、PNG、GIF、WebP，按文件签名判断；单张最大 5MB、单篇最多 50 张、总计最大 50MB。
- frontmatter 映射到文章字段；除本地图片地址外，正文保持原样，Mermaid、KaTeX、代码块和 Markdown 均会保留。
- Markdown 正文不写入审批或审计；暂存正文在批准、拒绝或过期清理后删除。

## 5. 审批流程

写 Tool 首次返回：

```json
{
  "status": "pending_approval",
  "approval_id": "...",
  "expires_at": "..."
}
```

登录 `/admin/mcp` 查看拟修改值并批准或拒绝。Agent 随后调用 `get_approval_status`，可得到 `pending_approval`、`approved` 或 `rejected`，以及 `failure_reason`、`post_id`、执行结果和时间。Agent 只能查询自己发起的审批。

过期审批会持久化为 `rejected`，原因为“审批请求已过期”。审批批准与业务执行使用幂等记录，重试不会重复创建分区或草稿。

## 6. Todo ID 限制

`todo_to_draft` 必须提供明确的 `todo_id`。当前没有 `search_todos` Tool，因此需要先在博客后台 Todo 页面点击复制图标取得 ID；Agent 不能仅凭标题猜测或批量转换 Todo。

## 7. 连接、审计与删除

- `/admin/mcp` 的“已连接 Agent 与本地导入器”展示客户端类型、名称、OAuth Client ID、scope、状态和最后使用时间。
- OAuth Agent 与本地导入凭证均可独立撤销；OAuth 撤销同时清理 Consent、Access Token、Refresh Token 和 DCR Client。
- 每次 Tool 调用先创建 `IN_PROGRESS` 审计，结束后更新为成功或失败；中断记录由维护任务修复为 `INTERRUPTED`。
- 审计只保存 Tool、业务 ID、字段名和截断后的 metadata 摘要，不保存正文、Access Token、Refresh Token、固定凭证或上传 Token。
- 有效凭证必须先撤销，待审批请求必须先批准、拒绝或过期，才能删除；审计可受控单条删除。
- 默认每个连接 60 次/分钟；单个只读 Tool 30 次/分钟；单个写 Tool 10 次/分钟。

## 8. OAuth 公共接口

| 接口 | 用途 |
|---|---|
| `https://liaoqizai.site/api/mcp` | Streamable HTTP MCP Resource |
| `https://liaoqizai.site/.well-known/oauth-protected-resource/api/mcp` | Resource Metadata |
| `https://liaoqizai.site/.well-known/oauth-authorization-server/api/oauth` | Authorization Server Metadata |
| `https://liaoqizai.site/api/oauth/oauth2/register` | DCR |
| `https://liaoqizai.site/api/oauth/oauth2/authorize` | Authorization + PKCE |
| `https://liaoqizai.site/api/oauth/oauth2/token` | Token 与刷新 |
| `https://liaoqizai.site/api/oauth/oauth2/revoke` | Token 撤销 |
| `https://liaoqizai.site/api/oauth/jwks` | ES256 JWKS |

只允许 `Authorization: Bearer` 传递 Access Token。Token 必须通过签名、`kid`、`iss`、精确 `aud`、有效期、管理员身份 `sub`、Client 和本地撤销状态校验。浏览器后台 Session 与已授权 Agent 的生命周期彼此独立，Agent 通过后台连接记录单独撤销。

## 9. 验证

```bash
npm run test:mcp
npm run test:mcp:gateway
MCP_OAUTH_TEST_DATABASE_URL="postgresql://.../qz_mcp_test" npm run test:mcp:oauth
```

`test:mcp` 不需要数据库。`test:mcp:gateway` 使用测试数据库验证本地 Markdown 导入。`test:mcp:oauth` 会清空名称包含 `test` 的本机 PostgreSQL 数据库，完整验证旧密码迁移、DCR、PKCE、Consent、Token、刷新、撤销、双 Agent 隔离、审批、审计与改密会话失效，禁止指向生产数据库。
