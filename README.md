# QZ Site

用于个人知识整理、Idea/Todo 收集和求职展示的单人网站。公开站点当前只提供中文界面，保留 `/zh` 路径结构；已经下线的 `/en` 与 `/en/*` 永久返回 `410 Gone`，不再提供语言切换。

## 技术栈

- **Web**：Next.js 16、React 19、TypeScript、Tailwind CSS
- **编辑器**：Milkdown Crepe，正文统一保存为 Markdown
- **数据**：PostgreSQL 16、Prisma 7
- **部署**：Docker Compose、Nginx、腾讯云镜像仓库
- **流水线**：Gitee Go 构建、部署与受限维护；GitHub 只同步仓库

## 文档索引

后续开发者或 Agent 应按以下顺序阅读：

1. [`docs/architecture.md`](docs/architecture.md)：**当前架构、模块边界、数据流和设计原因**。
2. [`docs/development-guide.md`](docs/development-guide.md)：开发步骤、常见改动方法、测试矩阵和交付清单。
3. [`docs/operations.md`](docs/operations.md)：生产部署、备份恢复、Gitee Agent、证书和故障处理。
4. [`docs/disaster-recovery.md`](docs/disaster-recovery.md)：整机故障、数据恢复、RPO/RTO 和演练步骤。
5. [`docs/site-audit-and-improvement-plan.md`](docs/site-audit-and-improvement-plan.md)：改造前审计基线与已完成项，不是待办清单。
6. [`docs/dependency-audit.md`](docs/dependency-audit.md)：依赖告警、处理方式与运行路径判断。
7. [`docs/session-summary.md`](docs/session-summary.md)：历史建站过程，仅供追溯，不作为当前技术或运维依据。
8. [`docs/local-mcp.md`](docs/local-mcp.md)：远程 OAuth MCP、Markdown 导入、审批、审计与 Trae 配置。
9. [`docs/prefix-inbox.md`](docs/prefix-inbox.md)：无 LLM 前缀收件箱的分流规则、数据安全、部署与回滚。

## 本地开发

```bash
npm ci --legacy-peer-deps
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

首次 Seed 需要至少 15 个字符的 `SEED_PASSWORD`。再次执行 Seed 不会覆盖已有管理员密码。日常开发也使用正式 migration；不要对生产数据库执行 `prisma db push`。

## 质量检查

```bash
npm run lint
npm test
npx tsc --noEmit
npx prisma validate
npm run test:mcp
npm run build
```

测试覆盖正文转换、目录 slug、发布时间规则、输入校验、上传文件签名、中文文案包和单语言路由合同。Dockerfile 在镜像构建时也会执行 lint、测试和生产构建。

## 线上博客 MCP

Trae 通过 `https://liaoqizai.site/api/mcp` 的 Streamable HTTP 直接管理线上博客，包含本机 Markdown/图片的远程搬运；MCP Client 不直连生产数据库。

它只负责导入用户已有 Markdown、搜索线上文章、修改草稿 metadata、创建分区、Todo 转草稿和查询审批状态，不提供正文生成、发布或删除工具。所有写操作先进入 `/admin/mcp`，由站长批准后在线上执行。

Trae 只需配置 MCP URL，首次连接时通过浏览器完成管理员登录、Agent 名称与权限确认；每个 Agent 会获得独立 OAuth 身份，可单独撤销、审计和限流。Markdown 与图片通过短期、单会话上传票据搬运，不再使用固定 credential 或本地 stdio。完整配置见 [`docs/local-mcp.md`](docs/local-mcp.md)。

## 数据变更

### Prisma migration

创建 Schema 变更后：

```bash
npx prisma migrate dev --name meaningful_name
npx prisma validate
```

生产 Web 容器只启动应用。`ops/deploy.sh` 在候选服务启动前使用一次性容器显式执行一次 `prisma migrate deploy`；迁移失败会终止切换，不会自动将失败的 migration 标记为成功。旧数据库若需要 baseline，必须先核对实际 Schema、创建备份，再执行一次性人工 baseline。

### 旧正文转换

脚本默认只检查，不写数据：

```bash
npm run content:migrate
```

生产环境通过受控脚本执行，`--apply` 会先创建数据库和上传文件备份：

```bash
bash ops/content-migration.sh --dry-run
bash ops/content-migration.sh --apply
```

转换在事务中完成，检查原始文本未丢失，并通过旧内容 Hash 防止并发覆盖。恢复旧正文必须使用转换前备份。

### 孤儿上传

```bash
npm run uploads:cleanup
bash ops/cleanup-uploads.sh --dry-run
```

默认只列出超过 24 小时且未被文章或项目引用的文件。生产删除必须显式使用 `--apply`，执行前会自动备份。

## 生产部署

服务器 `.env` 必须包含：

- `WEB_IMAGE`：镜像仓库的不可变 digest
- `APP_RELEASE_SHA`：与运行镜像一致的 40 位小写 Git SHA
- `DB_NAME`、`DB_USER`、`DB_PASSWORD`
- `DATABASE_URL`：密码需进行 URL 编码
- `SESSION_SECRET`：至少 32 个随机字符
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GITHUB_URL`

前缀收件箱使用 `INBOX_ENABLED` 紧急关闭开关；未配置时默认为 `true`，设置为 `false` 可关闭入口。

缺少数据库密码、数据库 URL、Session Secret、站点 URL 或镜像引用时，Compose 会直接失败。

Gitee `main` 推送先用平台提供的 `GITEE_COMMIT` 生成一次性 `Dockerfile.release`，再由 `build@docker` 构建同名 SHA 镜像。自有 Agent 只在生产机调用：

```bash
bash ops/deploy-entry.sh <40位GitSHA> ccr.ccs.tencentyun.com/lqzzql/web:<同一GitSHA>
```

发布顺序固定为：显式推送 Gitee `main` 产生流水线 `PushEvent`，立即推送同一 SHA 到 GitHub，再分别核对两个远端。GitHub→Gitee 镜像只负责代码同步，不能替代 Gitee 的直接 push 触发事件；生产脚本只把固定 Gitee `main` 视为发布来源。

部署脚本会串行加锁、拒绝降级、检查磁盘、创建部署前备份，并把 SHA tag 解析为不可变 digest；OCI revision、容器版本、健康接口、目标提交和由该提交生成的受跟踪源码清单必须一致。只有显式允许的 `source-manifest.json` 发布附件不参与自身指纹；任何其他清单外源码、清单内文件漂移或清单 SHA 不一致都会拒绝发布。最终候选镜像先在隔离的 production dump 副本上执行两次 migration 验证兼容性与幂等性，通过后才写 `.deploy-pending`、切换代码并对 live database 显式执行一次 migration。真实公网 DNS/TLS/路由验证成功后才原子确认 `.deploy-state` 和 `.deploy-history`。失败时仅使用本地上一稳定 digest 回滚；确认中断则由每分钟 watchdog 恢复。数据库 migration 仍应向后兼容，因为应用回滚不会自动逆转数据库变更。

仓库中共有三份 Gitee Go 定义：`pipeline-deploy` 在 `main` 推送时构建并部署；`pipeline-public-monitor` 每日从公网核对 DNS、TLS、路由和稳定版本；`pipeline-maintenance` 只在故障、临时备份、恢复验证或证书轮换时手动执行固定动作。维护入口不接受任意 Shell，也不承担自动定时调度。GitHub 当前只作为代码镜像仓库，不运行部署或生产维护工作流。

生产机是 2 核 2G 规格，禁止在服务器执行 `docker build`、`npm ci`、`next build` 或全量测试。Compose 将数据库、Web 和 Nginx 分别限制为 512MB、768MB 和 128MB；主机保留 1GB、`swappiness=10` 的应急 Swap。镜像编译和完整质量检查只能在本地或托管 CI 完成。

腾讯云 TCR 中的 `node` 是云端构建基础镜像，`web` 是每次发布生成的应用镜像。PostgreSQL 与 Nginx 已固定官方 digest，当前不需要额外创建 TCR 仓库；只有新机器恢复时实际遇到 Docker Hub 不可用，才增加对应镜像副本。

## 备份与恢复

```bash
bash ops/backup.sh manual
bash ops/verify-backup.sh
```

当前 `ops/backup.sh` 创建的每个新备份集包含：

- PostgreSQL custom-format dump
- `data/uploads` 公开上传压缩包
- `data/study-uploads` 私有题图压缩包
- 同时覆盖上述三项的 SHA-256 校验清单

恢复验证会安全解包备份集内的上传归档，并启动不映射端口的临时 PostgreSQL 容器真实执行 `pg_restore`。若恢复出的数据库存在 `"QuestionImage"` 表，则同组私有题图归档必须存在，并逐条核对 `storageKey`、`byteSize` 和 `sha256`；不存在 `"QuestionImage"` 表的上线前旧备份，允许仅含数据库 dump、公开 uploads 和覆盖两项的校验清单。新备份排除临时 `.mcp-staging`。验证成功会保护该完整集合；scheduled 保留 30 天，predeploy 最近 5 套，cleanup/migration 各最近 3 套。

生产维护由服务器 `ubuntu` 用户 Cron 直接调度：每日 03:00 完整备份、每日 03:20 条件式统一存储清理、每周日 03:30 隔离恢复验证、每日 02:10/14:10 ACME 到期检查、每小时第 15 分钟清理 MCP/OAuth 过期数据，并每分钟检查未完成发布。Cron 属于一次性主机配置，不由启用了 `NoNewPrivileges` 的 Gitee Agent 在每次发布时重装；新机器恢复或计划发生变化时，从受信任的服务器登录会话执行：

```bash
bash ops/maintenance.sh install-cron
```

Cron 安装会移除旧的数据库-only 备份和证书任务；统一日志写入 `backups/maintenance.log`，10 MiB 轮转、保留 5 份 gzip。不要为自动安装 Cron 而关闭 Gitee Agent 的 `NoNewPrivileges` 安全限制。完整架构说明见 [`docs/architecture.md`](docs/architecture.md)，生产操作见 [`docs/operations.md`](docs/operations.md)，整机恢复见 [`docs/disaster-recovery.md`](docs/disaster-recovery.md)。

## 安全边界

- 后台是单用户 Better Auth 数据库 Session，生产 Cookie 强制 `HttpOnly`、`Secure` 和 `SameSite=Lax`。
- 远程 MCP 使用 OAuth 2.1、公开客户端 DCR、强制 S256 PKCE、15 分钟 ES256 JWT 和轮换 Refresh Token。
- 新密码长度为 15–128 个字符，修改密码后当前 Session 立即失效。
- 上传文件检查真实文件签名，不信任浏览器 MIME。
- 生产 Web 以非 Root 用户运行。
- `.env`、证书私钥、数据库、上传文件和备份不进入 Git。
- 日常发布与只读维护由 CI/CD 完成；服务器直连只保留平台专用部署密钥或云控制台应急入口。
