# 前缀驱动的智能收件箱

## 功能边界

第一版是**完全确定性的本地分流器**，不会调用 LLM、抓取文章网址或连接第三方服务。

| 前缀 | 目标 | 初始状态 |
| --- | --- | --- |
| `文章：` / `文章:` | `Post` | `DRAFT` |
| `idea：` / `idea:` | `Idea` | 私人笔记 |
| `todo：` / `todo:` | `Todo` | `TODO` |

`idea` 与 `todo` 大小写不敏感。解析器只读取开头的第一个前缀，正文内后续出现的前缀不会再次分段。文章网址只作为正文文本保存。

## 数据与事务

一次提交分成两个持久化阶段：

1. 创建 `InboxItem(RECEIVED)`，保存包含前缀的原始 `rawInput`、UTF-8 SHA-256、解析正文和解析器版本。
2. 在单个数据库事务中创建正式对象、`InboxExecution` 和审计事件，并把记录更新为 `APPLIED`。

第二阶段失败时，原文仍保留，记录转为 `FAILED`，后台可重新执行确定性分流。`ownerId + requestKey`、`InboxExecution.inboxItemId` 以及三个正式对象的 `sourceInboxItemId` 唯一约束共同防止双击或并发重试产生重复对象。

数据库触发器禁止更新 `InboxItem.rawInput` 与 `rawSha256`。管理员可以显式删除单条 Inbox 记录；删除会移除该记录的原文、执行记录和事件，并解除正式文章、Idea 或 Todo 的来源关联，但不会删除已经创建的正式内容。单独删除正式文章、Idea 或 Todo 仍不会自动删除 Inbox 原文或执行历史。

## 权限与渲染

- `/admin/inbox`、`/admin/ideas` 和对应 API 都要求现有管理员 Session。
- Inbox 与 Idea 查询始终包含当前 `ownerId`；越权 ID 统一表现为不存在。
- 现有 `Post`、`Todo` 与 `Project` 仍是站点原有的单管理员模型，没有 `ownerId`。本版本因此只支持一个管理员账号；开放第二账号前必须先完成这三类数据的多租户迁移与全链路 owner 过滤。
- 新写接口校验同源 `Origin`、`application/json` 与字段白名单。
- 私有 API 返回 `Cache-Control: private, no-store`。
- Inbox 原文仅作为 React 文本或 `<pre>` 展示，不解释 HTML，也不使用 `dangerouslySetInnerHTML`。
- Inbox 创建的文章固定为 `DRAFT`，仍需在现有编辑器中手动发布。

## 测试

常规检查：

```bash
npm test
npm run lint
npx tsc --noEmit
npx prisma validate
```

真实数据库与端到端脚本会创建并删除 Inbox 测试数据，**只能连接一次性的隔离测试数据库**。数据库集成脚本会拒绝非本机地址以及名称不含 `test` 的数据库：

```bash
DATABASE_URL=postgresql://.../prefix_inbox_test npm run test:inbox:integration
INBOX_TEST_BASE_URL=http://127.0.0.1:3000 \
INBOX_TEST_PASSWORD=... \
INBOX_E2E_CONFIRM_ISOLATED_DB=true npm run test:inbox:e2e
```

## 部署与迁移

功能默认启用：

```dotenv
INBOX_ENABLED=true
```

推送到 Gitee `main` 后，`pipeline-deploy` 会自动完成云端镜像构建、部署前备份、`prisma migrate deploy`、容器切换和健康检查，无需手动登录腾讯云服务器。`INBOX_ENABLED` 未配置时也会启用；只有紧急停用入口时才设置为 `false` 并重新部署。

发布流水线顺序：

1. Gitee Go 构建并发布不可变应用镜像。
2. 自有 Agent 在腾讯云服务器创建并校验 PostgreSQL 部署前备份。
3. 部署脚本拉取镜像，启动 Web 容器并自动执行 `prisma migrate deploy`。
4. 流水线等待数据库、Web 和 Nginx 健康，并执行发布冒烟验证。
5. 任一步骤失败时停止发布并恢复上一应用版本；数据库 migration 继续遵循向后兼容策略。

迁移只保留现有 Todo 优先级，并增加 nullable 字段、新表、索引、外键与原文不可变触发器。生产环境禁止使用 `prisma db push`。

## 回滚

应用级回滚优先把 `INBOX_ENABLED` 设回 `false`。旧版本必须已兼容 nullable `Todo.priority`；新增表与已保存数据保留，不执行反向 migration。只有确认 migration 造成数据损坏时，才停止写入并恢复发布前数据库备份。
