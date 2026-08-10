# 博客远程 MCP 使用说明

## 1. 使用方式

博客 MCP 是部署在 `liaoqizai.site` 上的 **OAuth 2.1 + Streamable HTTP** 服务。Trae 只需要一个地址，不需要下载项目、启动 Node、填写固定 Token 或配置本地 stdio：

```json
{
  "mcpServers": {
    "qz-blog": {
      "url": "https://liaoqizai.site/api/mcp"
    }
  }
}
```

首次连接会打开浏览器授权页：

1. Trae 通过 DCR 注册自己的公开 OAuth Client。
2. 博客要求输入管理员密码，并展示 Agent 名称、回调地址和申请权限。
3. 同意后，Trae 保存 30 天轮换 Refresh Token，并使用它换取 15 分钟 Access Token。
4. Access Token 到期时由 Trae 在后台刷新，不会每次操作都重新弹出授权页。
5. `/admin/mcp` 会显示该 Agent，可单独撤销、审计和限流。

只有首次授权、Refresh Token 失效、管理员主动撤销或服务端要求重新授权时，才需要再次打开浏览器。不要在 Trae 配置中手工添加 `Authorization` Header。

## 2. 权限与工具

OAuth 有五个业务权限：

| Scope | 用途 |
|---|---|
| `draft:import` | 搬运用户已经写好的 Markdown 和图片 |
| `draft:read` | 搜索草稿及文章 metadata |
| `draft:update` | 提交草稿 metadata 修改审批 |
| `category:create` | 提交新建分区审批 |
| `todo:convert` | 提交 Todo 转草稿审批 |

对应七个工具：

| Tool | 行为 |
|---|---|
| `begin_markdown_draft_import` | 校验 Markdown 与图片清单，创建短期上传会话 |
| `finalize_markdown_draft_import` | 校验全部暂存文件并创建草稿导入审批 |
| `search_drafts` | 按标题、关键词、标签、分区和状态查询 |
| `update_draft_metadata` | 只修改 metadata，不修改正文 |
| `create_category` | 创建 BLOG 或 TODO 分区 |
| `todo_to_draft` | 搬运指定 Todo 的已有内容，不生成正文 |
| `get_approval_status` | 查询当前 Agent 自己发起的审批结果 |

MCP 不提供正文生成、发布或删除工具。OAuth Consent 只决定某个 Agent能使用哪些能力；每一次写操作仍需在博客后台单独批准。

## 3. 远程 Markdown 导入

向 Trae 明确指定本机 Markdown 文件后，标准流程是：

1. Trae 逐字读取该文件，不能生成、续写或改写正文。
2. Trae 找出 Markdown 正文和 frontmatter 中的本地图片引用，读取原始字节并计算 SHA-256 与大小。
3. Trae 调用 `begin_markdown_draft_import`，发送 Markdown 全文和图片清单。
4. 服务端校验内容后返回 `bundle_id`、一次性 `upload_token` 和每张图片的 HTTPS PUT 地址。
5. Trae 用返回的 `X-MCP-Upload-Token` Header 把每张图片的原始字节上传到对应地址。
6. Trae 调用 `finalize_markdown_draft_import`。服务端再次核对 Markdown、图片大小、SHA-256 和真实文件签名，然后只创建待审批请求。
7. 管理员在 `/admin/mcp` 批准后才创建 `DRAFT` 文章；Trae 用 `get_approval_status` 取得最终 `post_id`。

短期上传票据不是 OAuth Access Token 或 Refresh Token。它只允许操作一个导入会话中预先声明的图片，默认 20 分钟失效，数据库只保存 Hash；它不会触发新的浏览器授权，也不能搜索文章或调用其他工具。

没有本地图片时，`begin_markdown_draft_import` 返回空上传清单，Trae 可直接调用 finalize。Trae 必须具备读取用户指定文件和发送 HTTPS PUT 的能力；远程服务器不会也不能主动浏览本机磁盘。

## 4. 导入约束

- Markdown 文件名只允许 `.md` 或 `.markdown`，正文最多 2MB。
- 单篇最多 50 张本地图片，单张最多 5MB，总计最多 50MB。
- 图片只允许 JPG、PNG、GIF、WebP，并按实际文件签名判断。
- `http:`/`https:` 图片保留原引用；已有 `/uploads/` 引用必须通过站内路径校验。
- 拒绝 `file:`、`data:`、协议相对地址和绝对本机路径。
- Markdown、Mermaid、KaTeX、代码块和 frontmatter 正文均保持原样。
- 正文和上传票据不会写入审批详情或审计；暂存文件在批准、拒绝或过期后清理。

## 5. 审批流程

写工具返回：

```json
{
  "status": "pending_approval",
  "approval_id": "...",
  "expires_at": "..."
}
```

管理员登录 `/admin/mcp` 查看拟变更摘要并批准或拒绝。Agent 随后调用 `get_approval_status`，得到 `pending_approval`、`approved` 或 `rejected`，以及失败原因、执行结果和最终业务 ID。Agent 只能读取自己发起的审批。

审批默认 24 小时过期。过期记录会转为 `rejected`，暂存文件由维护任务删除；幂等执行记录保证重试不会重复创建草稿或分区。

## 6. Todo ID 限制

`todo_to_draft` 必须提供准确的 `todo_id`。当前没有 `search_todos` 工具，需要先在博客后台 Todo 页面点击复制图标取得 ID。Agent 不应凭标题猜测 ID，也不能批量转换 Todo。

## 7. 撤销、审计与删除

- `/admin/mcp` 展示 Agent 名称、Client ID、scope、状态和最后使用时间。
- 撤销 Agent 会同时撤销 Consent、Access Token、Refresh Token 和 DCR Client；未过期 JWT 也会立即被服务端拒绝。
- 每次工具调用记录 `IN_PROGRESS` 审计，结束后更新为成功或失败；维护任务将异常中断项修复为 `INTERRUPTED`。
- 审计只保存工具名、业务 ID、字段名和截断 metadata，不保存正文、OAuth Token 或上传票据。
- 有效 Agent 必须先撤销，待审批记录必须先批准、拒绝或过期，才能删除。
- 历史 `STATIC` 记录只是旧版本遗留，不能再访问任何 MCP 接口；可在撤销后按受控顺序删除。

## 8. 公共接口

| 接口 | 用途 |
|---|---|
| `https://liaoqizai.site/api/mcp` | Streamable HTTP MCP Resource |
| `https://liaoqizai.site/.well-known/oauth-protected-resource/api/mcp` | Resource Metadata |
| `https://liaoqizai.site/.well-known/oauth-authorization-server/api/oauth` | Authorization Server Metadata |
| `https://liaoqizai.site/api/oauth/oauth2/register` | DCR |
| `https://liaoqizai.site/api/oauth/oauth2/authorize` | Authorization + PKCE |
| `https://liaoqizai.site/api/oauth/oauth2/token` | Token 签发与刷新 |
| `https://liaoqizai.site/api/oauth/oauth2/revoke` | Token 撤销 |
| `https://liaoqizai.site/api/oauth/jwks` | ES256 JWKS |

Access Token 只能通过 `Authorization: Bearer` 传递。资源服务器验证签名、`kid`、`iss`、精确 `aud`、有效期、管理员 `sub`、Client、scope 和本地撤销状态。

## 9. 验证

```bash
npm run test:mcp
npm run test:mcp:gateway
MCP_OAUTH_TEST_DATABASE_URL="postgresql://.../qz_mcp_test" npm run test:mcp:oauth
```

`test:mcp` 验证 Streamable HTTP 协议和工具列表。`test:mcp:gateway` 使用隔离测试数据库验证远程 Markdown/图片暂存、审批、正文保密和清理。`test:mcp:oauth` 会清空名称包含 `test` 的本机 PostgreSQL 数据库，完整验证 DCR、PKCE、Consent、Token 刷新、撤销、双 Agent 隔离、审批、审计和管理员改密，禁止指向生产数据库。
