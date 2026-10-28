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

OAuth 有八个业务权限：

| Scope | 用途 |
|---|---|
| `draft:import` | 搬运用户已经写好的 Markdown 和图片 |
| `draft:read` | 搜索草稿及文章 metadata |
| `draft:update` | 提交草稿 metadata 修改审批 |
| `category:create` | 提交新建分区审批 |
| `todo:convert` | 提交 Todo 转草稿审批 |
| `material:read` | 读取当前所有者的私人材料、原文与讨论摘要 |
| `material:write` | 提交私人材料保存、整理和讨论状态修改审批 |
| `material:convert` | 提交材料转 Todo 或文章草稿审批 |

对应十三个工具：

| Tool | 行为 |
|---|---|
| `begin_markdown_draft_import` | 校验 Markdown 与图片清单，创建短期上传会话 |
| `finalize_markdown_draft_import` | 校验全部暂存文件并创建草稿导入审批 |
| `search_drafts` | 按标题、关键词、标签、分区和状态查询 |
| `update_draft_metadata` | 只修改 metadata，不修改正文 |
| `create_category` | 创建 BLOG 或 TODO 分区 |
| `todo_to_draft` | 搬运指定 Todo 的已有内容，不生成正文 |
| `get_approval_status` | 查询当前 Agent 自己发起的审批结果 |
| `create_material` | 逐字保存输入及来源为一条私人材料，不自动拆成 Todo |
| `list_materials` | 列出当前所有者的材料，可筛选讨论状态 |
| `search_materials` | 搜索当前所有者的标题、原文、整理内容及讨论摘要 |
| `read_material` | 读取指定材料的原文、来源、采集时间、讨论状态与转换关联 |
| `update_material` | 提交整理内容、讨论状态或摘要的修改审批；原文不可改 |
| `convert_material` | 经明确决定后转换一个 Todo 或草稿，保留原材料及关联 |

MCP 不提供正文生成、发布或删除工具。OAuth Consent 只决定某个 Agent能使用哪些能力；每一次写操作仍需在博客后台单独批准。

新增材料权限不会自动授予已有 Agent；需要材料能力时由用户在 OAuth 授权页明确同意。旧的 `draft:*` 权限不能读取私人材料。所有材料操作的所有者来自 Access Token 的 `sub`，工具参数不能指定或更换 owner。

材料写工具必须提供 8–100 位的 `request_key`（字母、数字、`.`、`_`、`:`、`-`）；同一次操作重试复用该 key，修改拟保存内容则使用新 key。相同 Agent、工具和 key 返回同一审批，改变 payload 会拒绝；采集和转换也有业务级幂等记录，因此确认丢失后重试不会重复创建材料或目标。`create_material` 即使收到 `todo:` 或 `文章:` 开头的原文，也只保存一条材料。

`discussion_status` 采用 `STORED`（暂存）、`WANT_DISCUSS`（想讨论）、`DISCUSSED`（已讨论）、`ARCHIVED`（已归档）；归档不删除原文。`update_material.changes` 复用后台 Idea 字段与校验，`convert_material.conversion` 复用原有 Idea 转换表单参数，不允许发布文章。

后台材料审批、审批内容预览和材料审计只展示给对应所有者。审批列表只展示摘要；点击“查看拟保存内容后再审批”才经鉴权读取完整拟保存内容。内容有输入长度上限，且只在当前页面展示，不写入审计日志。审批状态查询的审计也按 Agent 所有者隔离，避免间接暴露材料 ID。

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

## 10. 私人素材工具

| 工具 | 权限 | 行为 |
|---|---|---|
| `list_materials` / `search_materials` | `material:read` | 按当前 OAuth 用户查询素材、讨论状态和摘要；不暴露其他所有者 |
| `read_material` | `material:read` | 读取原文、可编辑整理内容、来源时间及转换链接 |
| `create_material` | `material:write` | 将原始文本原样保存为私人素材；即使以 todo/文章前缀开头也不转换任务 |
| `update_material` | `material:write` | 修改标题、整理正文、标签、讨论状态或摘要；不能改原始输入/来源/时间/所有者 |
| `convert_material` | `material:convert` | 明确将素材转换为 Todo 或未发布草稿，保留来源链接 |

新增 scope 不会自动授予旧 Agent；需要所有者按原有 OAuth Consent 流程主动授权。没有修改 Session、Token 生命周期或部署凭证。所有写工具继续先进入后台审批。所有者须先展开“查看提案”核对完整原文或具体修改，再批准；提案仅在鉴权、所有者检查后按需返回，不进入审计正文。

写调用必须提供稳定的 `request_key`。重试相同 key/参数复用同一审批与目标；改变参数但沿用 key 返回冲突。所有者来自已验证的 OAuth subject，而不是模型输入。审批读取、批准、拒绝、删除以及材料相关审计均按实际 Session 所有者过滤；审批成功后重放也先校验身份。转换仍不提供发布、删除或自动正文生成能力。
