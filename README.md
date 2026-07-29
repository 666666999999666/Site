# QZ Site

用于个人知识整理、Idea/Todo 收集和求职展示的单人网站。

## 技术栈

- **Web**：Next.js 16、React 19、TypeScript、Tailwind CSS
- **编辑器**：Milkdown Crepe，正文统一保存为 Markdown
- **数据**：PostgreSQL 16、Prisma 7
- **部署**：Docker Compose、Nginx、腾讯云镜像仓库
- **流水线**：Gitee Go 主部署、GitHub Actions 备用部署与维护

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
npm run build
```

测试覆盖正文转换、目录 slug、发布时间规则、输入校验和上传文件签名。Dockerfile 在镜像构建时也会执行 lint、测试和生产构建。

## 数据变更

### Prisma migration

创建 Schema 变更后：

```bash
npx prisma migrate dev --name meaningful_name
npx prisma validate
```

生产容器启动时只执行 `prisma migrate deploy`。迁移失败会终止启动，不会自动将失败的 migration 标记为成功。旧数据库若需要 baseline，必须先核对实际 Schema、创建备份，再执行一次性人工 baseline。

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
- `DB_NAME`、`DB_USER`、`DB_PASSWORD`
- `DATABASE_URL`：密码需进行 URL 编码
- `SESSION_SECRET`：至少 32 个随机字符
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GITHUB_URL`

缺少数据库密码、数据库 URL、Session Secret、站点 URL 或镜像引用时，Compose 会直接失败。

Gitee `main` 推送由平台的 `build@docker` 步骤构建镜像，自有 Agent 只在生产机调用：

```bash
bash ops/deploy.sh origin/main ccr.ccs.tencentyun.com/lqzzql/web:latest
```

部署脚本会串行加锁、拉取代码、创建部署前备份、把镜像解析为不可变 digest、等待数据库/Web/Nginx 全部 Healthy，并请求正式域名健康接口。失败时输出诊断并恢复上一版本代码与镜像。数据库 migration 仍应设计为向后兼容，因为应用回滚不会自动逆转数据库变更。

GitHub Actions 的 `Build and Deploy` 是手动备用链路，要求目标提交也已同步到 Gitee。`Production Maintenance` 只允许固定的状态、备份、恢复验证、证书和只读扫描操作。

生产机是 2 核 2G 规格，禁止在服务器执行 `docker build`、`npm ci`、`next build` 或全量测试。Compose 将数据库、Web 和 Nginx 分别限制为 512MB、768MB 和 128MB；主机保留 1GB、`swappiness=10` 的应急 Swap。镜像编译和完整质量检查只能在本地或托管 CI 完成。

## 备份与恢复

```bash
bash ops/backup.sh manual
bash ops/verify-backup.sh
```

每个备份集包含：

- PostgreSQL custom-format dump
- `data/uploads` 压缩包
- SHA-256 校验清单

恢复验证会启动不映射端口的临时 PostgreSQL 容器，真实执行 `pg_restore` 并读取文章、项目、设置、Todo、用户和 migration 表，然后自动删除临时容器。备份默认保留 30 天。

建议服务器 cron：

```cron
0 3 * * * cd /home/ubuntu/个人网站 && bash ops/maintenance.sh backup >> backups/maintenance.log 2>&1
30 3 * * 0 cd /home/ubuntu/个人网站 && bash ops/maintenance.sh verify-backup >> backups/maintenance.log 2>&1
0 9 * * 1 cd /home/ubuntu/个人网站 && bash ops/maintenance.sh ssl >> backups/maintenance.log 2>&1
```

完整生产操作与故障恢复步骤见 [`docs/operations.md`](docs/operations.md)。

## 安全边界

- 后台是单用户 Session 登录，生产 Cookie 强制 `Secure`。
- 新密码长度为 15–128 个字符，修改密码后当前 Session 立即失效。
- 上传文件检查真实文件签名，不信任浏览器 MIME。
- 生产 Web 以非 Root 用户运行。
- `.env`、证书私钥、数据库、上传文件和备份不进入 Git。
- 日常发布与只读维护由 CI/CD 完成；服务器直连只保留平台专用部署密钥或云控制台应急入口。
