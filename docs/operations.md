# QZ Site 生产运维手册

> **文档定位**：本文是当前生产操作的唯一常规手册，最后核对日期为 **2026-08-25**。整机或磁盘故障恢复见 [`disaster-recovery.md`](disaster-recovery.md)。

## 1. 运维边界

**生产 PostgreSQL、公开 `data/uploads` 和私有 `data/study-uploads` 是内容事实来源**。本地数据库、Seed 数据和本地上传不能覆盖生产数据。

生产机为 2 核 2G，只负责：

- 拉取 Git 提交和镜像。
- 创建备份。
- 执行 `prisma migrate deploy`。
- 切换 Compose 服务。
- 执行轻量健康、来源和冒烟检查。

禁止在生产机执行 `docker build`、`npm ci`、`next build`、完整测试或压力测试。部署、备份、恢复验证和维护共享 `/tmp/qzsite-operation.lock`，不会并发运行。

## 2. 流水线与仓库

| 流水线 | 触发 | 职责 |
|---|---|---|
| `pipeline-deploy` | 推送 Gitee `main` | 云端构建、推送 Web 镜像、生产部署、内部/公网 smoke 与 provenance 验证 |
| `pipeline-public-monitor` | 每日定时 | 从真实公网核对 DNS、TLS、路由和 `.deploy-state` 对应版本 |
| `pipeline-maintenance` | 手动 | 故障、临时备份、恢复验证或证书轮换时执行固定动作 |

三条流水线不是三套部署方式。日常发布只走 `pipeline-deploy`；`pipeline-public-monitor` 只做真实公网巡检，`pipeline-maintenance` 是不接受任意 Shell 的受限应急入口。GitHub 只同步仓库，不运行生产 Action。

Gitee 是唯一生产源。发布时必须先把精确 SHA 直接推到 Gitee `main` 以产生 `PushEvent`，随即把同一 SHA 推到 GitHub `main` 并分别核对远端值；不要依赖 GitHub 到 Gitee 的仓库镜像，因为镜像同步可以更新分支却不产生流水线触发事件。生产部署始终从固定 Gitee URL 获取并验证 `main`，不依赖服务器 Git `origin` 指向哪里。

TCR 当前只需要：

| 仓库 | 用途 | 结论 |
|---|---|---|
| `lqzzql/node` | Gitee 云端构建基础镜像 | 必需，Dockerfile 固定 digest |
| `lqzzql/web` | 本站运行镜像 | 必需，构建推送完整 Git SHA tag，运行使用解析后的 digest |
| `postgres`、`nginx` | 官方镜像缓存 | 当前不必创建；Compose 已固定官方 digest |

PostgreSQL 和 Nginx 镜像只在版本变更或新机器恢复时拉取，不值得为当前单机额外维护 TCR 副本。若未来 Docker Hub 在实际恢复中不可用，再镜像到 TCR，并把 Compose 更新为新仓库的固定 digest。

## 3. 自动部署

Gitee Agent 先从目标提交提取 `deploy-entry.sh`，再由入口把同一提交的部署、公共函数、完整备份和私有目录准备脚本暂存到旧工作区中执行。这样首次从旧版脚本升级、失败后重试时，也不会在 checkout 前退回旧版两文件备份。等价的日常入口为：

```bash
bash ops/deploy-entry.sh <40位GitSHA> ccr.ccs.tencentyun.com/lqzzql/web:<同一GitSHA>
bash ops/maintenance.sh status
```

`ops/deploy.sh` 的顺序是：

1. 获取全局操作锁，检查至少 5 GiB 可用空间，并确认完整目标 SHA 等于 Gitee `main` 且不是降级。
2. 使用目标提交的新版备份逻辑创建 PostgreSQL、公开 uploads、私有题图和 SHA-256 同组备份。
3. 只拉取一次与目标提交同名的候选 tag，解析为不可变 `@sha256:` digest，并核对 OCI revision 与镜像版本环境变量。
4. 将刚生成的 production dump 恢复到无端口、内部网络的一次性 PostgreSQL 16；使用最终候选镜像内的 Prisma 工具链迁移两次，要求无未完成/回滚 migration，且文章、草稿、项目、Todo、Idea、DailyQuote、Session、OAuth/MCP 等受保护行数不变。
5. 写入 `.deploy-pending`，切换到目标提交，并对比目标源码、Compose、Nginx conf 与候选镜像内的 SHA-256 源码指纹。
6. 以 digest 更新 Compose，并对 live database 通过一次性容器显式执行一次 migration。
7. 启动候选并等待三个服务 Healthy。
8. 验证 Nginx 配置并 reload。
9. 执行回环限定的健康、中文路由、安全边界及 Question 写入/清理冒烟，并保留 `.deploy-pending`。
10. 通过真实公网 DNS/TLS/路由再次验证相同 release SHA。
11. 原子写入 `.deploy-state`，追加 `.deploy-history`，再次核对运行容器、镜像、tracked 工作树与源码指纹后清除 pending。

发布链路不读取 `latest`。流水线的 `GITEE_COMMIT`、`GITEE_DOCKER_IMAGE`、SHA tag、OCI revision、健康接口版本和生产 `gitee-production/main` 必须完全一致；交错或陈旧流水线会在切换前失败。

部署失败会恢复上一代码提交、上一镜像和上一 `.deploy-state`。Prisma migration 不会自动逆转，因此 migration 必须向后兼容，优先新增 nullable 字段、兼容读写和后续清理。

`.deploy-state` 固定为提交、不可变镜像 digest、源码指纹三列；`.deploy-history` 只记录完成内部与公网验证的稳定版本。部署确认中断时，Cron 每分钟运行的 `deploy-watchdog.sh` 会在过期后用本地上一稳定 digest 恢复，不访问镜像仓库。

部署成功至少满足：

```bash
bash ops/maintenance.sh status
```

该命令同时验证：

- `db`、`web`、`nginx` 正在运行。
- 当前 Git 提交与 `.deploy-state` 一致。
- Web 容器使用记录的镜像 digest。
- 运行镜像指纹与服务器源码一致。

`status` 是严格只读入口，不再顺带执行 Question 写冒烟、MCP/OAuth 清理或任何存储删除。完整内部与公网路由冒烟由发布流水线在切换后的独立步骤执行，写冒烟清理由对应脚本负责。

`robots.txt` 有意不屏蔽 `/en`：爬虫需要访问这些旧地址并观察 `410 Gone`，才能逐步移除旧索引。这与 sitemap、RSS 和页面 canonical 不再发布英文 URL 是同一退役策略。英文页面 `410` 与旧远程 Tool Gateway `410` 是两个独立合同，冒烟测试必须分别验证。

## 4. 固定维护入口

`ops/maintenance.sh` 只接受以下动作：

| 动作 | 影响 |
|---|---|
| `status` | 只读检查容器和发布来源，不写数据库、不运行维护 |
| `backup` | 创建完整生产备份集 |
| `verify-backup` | 在隔离 PostgreSQL 容器恢复最新备份 |
| `ssl` | 检查 30 天证书余量和本机 HTTPS |
| `install-cron` | 从受信任的服务器登录会话幂等安装定时任务并移除两条旧任务；不通过 Gitee Agent 执行 |
| `install-tls` | 校验证书和私钥后原子替换、测试并 reload |
| `content-dry-run` | 只读扫描旧 Tiptap 正文 |
| `uploads-dry-run` | 只读扫描孤儿上传 |
| `study-uploads-dry-run` | 只读扫描私有题图和过期答案摘要 |
| `study-uploads` | 先创建完整备份，再清理私有题图和过期答案摘要 |
| `storage-cleanup` | 先汇总普通上传、私有题图和过期 Review Ticket；有候选时只创建一套完整备份后统一清理，并按稳定历史收敛旧 Web 镜像 |
| `acme` | 证书进入 30 天续期窗口后执行受控 HTTP-01 自动续期；未到期时不访问外网 |
| `mcp` | 清理过期审批、暂存包、限流桶、中断审计和未完成 OAuth Client |

其他值会被拒绝。不得增加 `eval`、任意命令变量或通用远程 Shell。

## 5. 定时任务

生产环境以 `ubuntu` 用户 Cron 作为唯一自动调度源。完整维护 Cron 和首次 watchdog 每分钟条目都通过受信任 SSH 一次性安装，不属于每次应用发布；发布 bootstrap 只会在切换前原子刷新 checkout-independent launcher。Gitee Agent 服务启用了 `NoNewPrivileges`，不能利用 `sudo` 或 `crontab` 的 setgid 权限写入 `/var/spool/cron`，也不应为此放宽该安全限制。`pipeline-deploy` 自身执行内部/公网 smoke 与 provenance 验证；Gitee Go 的 `pipeline-maintenance` 仅供不需要主机提权的手动应急动作，不设置定时触发。

当前计划：

| 时间 | 动作 | 资源控制 |
|---|---|---|
| 每日 03:00 | 完整数据库、公开 uploads 与私有题图备份 | 串行执行、进程锁保护 |
| 每日 03:20 | 条件式统一存储清理与旧 Web 镜像治理 | 三类候选全为 0 时不备份；有候选只备份一次；上传保留 24 小时保护期 |
| 每周日 03:30 | 在临时容器真实恢复最新备份 | 384MB/0.75 CPU |
| 每小时第 15 分钟 | MCP/OAuth 过期数据维护 | 轻量 |
| 每日 02:10、14:10 | ACME 到期检查与必要时续期 | 未进入 30 天窗口时零外部网络 |
| 每分钟 | 检查过期 `.deploy-pending` | 无 pending 时静默；恢复只使用本地上一稳定 digest |

新机器恢复、计划变化或需要修复调度时，从受信任的服务器登录会话执行：

```bash
bash ops/maintenance.sh install-cron
```

**“问题中学”功能首次发布成功后，也必须从受信任的主机登录会话执行一次 `bash ops/maintenance.sh install-cron`**。脚本使用带标记的 crontab 区块，重复执行不会产生重复任务，并会删除旧的 `/home/ubuntu/backup-db.sh` 和 `/home/ubuntu/check-ssl.sh` 条目。执行后用 `crontab -l` 确认每日 03:20 的 `storage-cleanup`、每日两次 `acme`、每小时 `mcp` 和每分钟 `deploy-watchdog` 均存在。统一日志位于 `backups/maintenance.log`，达到 10 MiB 后轮转，保留 5 份 gzip 压缩历史。

## 6. 备份与验证

手动创建和验证：

```bash
bash ops/maintenance.sh backup
bash ops/maintenance.sh verify-backup
```

每个 `BACKUP_SET` 包含：

- `qzsite-<timestamp>-<label>.dump`：PostgreSQL custom-format dump。
- `qzsite-<timestamp>-<label>-uploads.tar.gz`：同一时点的公开 `data/uploads`。
- `qzsite-<timestamp>-<label>-study-uploads.tar.gz`：同一时点的私有 `data/study-uploads`。
- `qzsite-<timestamp>-<label>.sha256`：上述三份数据文件的校验值。

私有题图归档不要求 Compose 的 Web 服务已经启动。备份脚本优先取得当前运行 Web 容器的精确镜像 ID；没有运行容器时使用 `.env` 的本地 `WEB_IMAGE`，以该镜像默认非 Root 身份启动 `--network none`、只读根文件系统的一次性容器，只读挂载 `data/study-uploads` 并流式生成 tar。镜像不存在、身份为 Root、目录不可读或 tar 失败时整组备份失败。

公开上传备份明确排除临时 `.mcp-staging`，因此新归档继续遵守“`uploads/` 下只含单层常规文件”的严格恢复合同。验证脚本仅为历史备份兼容一个空的 `uploads/.mcp-staging/` 目录；其下任何文件、链接、重复目录或其他嵌套路径仍立即失败。验证还会检查清单与 SHA-256，拒绝路径穿越、异常根目录、链接、重复项和非普通文件；随后把两份归档解包到一次性隔离目录，并在不映射端口的临时 PostgreSQL 16 容器中真实执行 `pg_restore`。包含 Questions 表的新备份还会逐一核对数据库中的私有题图记录、大小和 SHA-256，最后自动删除容器和隔离目录。

保留按完整集合执行，绝不只删 dump 或其中一份上传归档：`scheduled` 保留 30 天，`predeploy` 最近 5 套，cleanup 与 migration 各最近 3 套；最近一次恢复验证成功的集合永远受保护。完整集合总量超过 1 GiB 时，先删非保护的旧 `predeploy`，仍超限则只报告、不扩大到手工或受保护备份。

兼容边界：在“问题中学”上线前创建、数据库中不含 Questions 表的旧备份，允许没有 `-study-uploads.tar.gz`，仍按原来的数据库、公开 uploads 和两项清单验证；一旦数据库中含 Questions 表，私有题图归档及其清单项缺失都必须判定为失败。恢复时始终按一个 `BACKUP_SET` 成组使用，不混用不同时间戳的数据库和任一上传归档。

验证失败时：

1. 停止新 migration、正文转换、上传清理和人工修复。
2. 保留失败备份与 `maintenance.log`。
3. 检查磁盘、容器健康、dump 大小和 SHA-256。
4. 修复后重新创建完整备份集并再次验证。

本机备份不能抵御云盘或整机丢失。异地保护状态和完整恢复步骤见 [`disaster-recovery.md`](disaster-recovery.md)。

## 7. 证书检查与更新

`www.liaoqizai.site` 会在 TLS 后 301 到 apex。证书 SAN 必须包含 `www.liaoqizai.site`，否则浏览器会在到达重定向前报告证书错误。更新前执行：

```bash
openssl x509 -in nginx/certs/server_bundle.crt -noout -text \
  | grep -A1 "Subject Alternative Name"
```

只读检查：

```bash
bash ops/maintenance.sh ssl
```

`ops/check-ssl.sh` 校验证书至少还有 30 天，并通过 `127.0.0.1` 访问正式域名虚拟主机。它不等同于公网监控；备案接入稳定后仍应保留外部可用性检查。

自动 ACME 首次配置只要求从受信任的服务器会话安全传入 `ACME_EMAIL`；运行镜像默认固定为已核对的 Certbot 5.7.0 amd64 digest：

```bash
ACME_EMAIL='<secure-input>' \
bash ops/configure-acme.sh
```

默认镜像为 `certbot/certbot@sha256:d07bd043d61d6bee1114235ac12c2e9a5c54b6931b3ccf5e1174d6c8c4afaa95`。只有审查并提交新 digest 时才允许用 `ACME_IMAGE` 显式覆盖，禁止使用 tag 或 `latest`。

脚本把账户配置以 `600` 权限保存到本机备份目录。续期只在证书少于 30 天时进行：预检本地不可变 Certbot 镜像后短暂停止 Nginx，使用 standalone HTTP-01 为 apex 与 `www` 签发，原子安装、启动并执行 `nginx -t` 与 HTTPS 健康检查；失败恢复旧证书。Cron 每日 02:10 和 14:10 调用，未到期时不访问外网。

在首次 ACME 签发和一次自动续期都真实验收前，保留现有 Base64 手动换证链路。手动更新时，在 Gitee Go 将以下值设为受保护变量：

- `TLS_CERT_B64`：完整证书链的 Base64。
- `TLS_KEY_B64`：未加密私钥的 Base64。
- `MAINTENANCE_ACTION=install-tls`。

`ops/install-tls.sh` 会自动：

1. 解码到权限为 `600` 的临时文件。
2. 校验域名、30 天有效期、私钥格式和公私钥匹配。
3. 将旧证书备份到 `backups/tls-<timestamp>/`。
4. 安装新文件，执行 `nginx -t`、reload 和 HTTPS 检查。
5. 任一步失败时恢复旧证书。

不得在 ACME 尚未验收时删除 `install-tls` 或 Base64 受保护变量；两条链路共用相同的证书覆盖、密钥匹配、Nginx 检查和失败恢复边界。

## 8. 数据与内容维护

旧正文转换：

```bash
bash ops/content-migration.sh --dry-run
bash ops/content-migration.sh --apply
bash ops/content-migration.sh --dry-run
```

最后一次应报告 0 篇 Tiptap JSON。`--apply` 会先备份并在事务中转换，不删除文章。

孤儿上传：

```bash
bash ops/cleanup-uploads.sh --dry-run
bash ops/maintenance.sh storage-cleanup
```

日常定时任务使用第二条统一入口：先分别报告普通上传数量/字节、私有题图工作量和过期 Review Ticket；三类都为 0 时直接结束且不制造备份，有候选时只创建一套 `storage-cleanup` 完整备份，再执行两类 guarded cleanup。单独运行任一 `--apply` 仍会自行创建完整备份，不能借统一入口绕过备份文件存在性校验。

宿主日志治理由 `ops/install-host-log-governance.sh` 一次性安装：journald 上限 512 MiB、保留 7 天且至少给磁盘留 5 GiB；Gitee Agent stdout 不再重复进入 journal，stderr 仍保留。脚本输出精确 `ROLLBACK_DIR`，必须先运行一次真实流水线；异常时用 `ops/rollback-host-log-governance.sh <ROLLBACK_DIR>` 恢复原 drop-in。自动镜像清理只有在 `.deploy-history` 已有三个本地可解析的稳定版本后才启用，只删除 7 天前、无容器引用且不属于当前/最近两个稳定版本的 Web 镜像。

禁止在生产执行 `prisma db push`。生产只使用已提交的 `prisma migrate deploy`。

## 9. 密钥、Agent 与应急权限

- `.env`、备份、证书和私钥不进入 Git；文件权限为 `600`，目录为 `700`。
- TCR 密码只通过 Gitee Secret 和 `docker login --password-stdin` 使用，任务结束自动 logout。
- Web 使用非 Root `node` 用户，Nginx 只读挂载 uploads。
- Nginx 普通访问日志只记录不含查询串和 Referrer 的 `$uri`；精确 `/api/questions` 搜索入口额外关闭继承的 error log，避免 upstream 故障把可匹配标准答案的搜索串写入请求行日志。其他路由继续保留错误日志。
- `/api/internal/question-smoke` 只能由 Web 容器内的 `127.0.0.1` POST 调用；Nginx 的 HTTP、IP TLS、www TLS 和正式域名 TLS 四个公开 server 都对该精确路径直接返回 404，不代理、不重定向。
- 后台密码若曾经通过聊天传输，站点所有者必须在后台改为新的独立长密码。
- Better Auth Session、OAuth 内部密钥和 JWKS 私钥都由生产 `SESSION_SECRET` 保护；轮换该值会使现有后台 Session 和加密 JWKS 私钥失效，必须按计划重新登录并重新授权 Agent。
- 远程 Agent 只使用 OAuth；Markdown 图片上传票据短期、单会话有效且数据库只保存 Hash。旧 `qzmcp_v1_...` 固定凭证已停用。
- 当前两条 `authorized_keys` 保持不变，按站点所有者要求由其最后自行移除。

Gitee Agent 由 `gitee-go-agent.service` 管理，限制为 256MB 内存和 50% CPU。云控制台应急检查：

```bash
systemctl is-active gitee-go-agent.service
sudo systemctl restart gitee-go-agent.service
```

Agent 正常重启后服务端释放旧注册可能延迟。先等待 6 分钟，连续 10 分钟仍未恢复再在 Gitee 主机组重新绑定，不要提前删除 UUID。UUID 只保存在服务器 `/home/ubuntu/.gitee-agent/uuid`，不得复制到仓库或日志。

## 10. 发布后核对

自动流水线已覆盖常规发布核对。涉及 Schema、正文或上传的高风险变更还需确认：

- 生产文章、项目、Todo、用户数量未意外变化。
- migration 只执行一次且状态为 applied。
- 公开上传和私有题图在容器重建后仍可读取；题图数据库记录与文件大小、SHA-256 一致。
- 最新完整备份能够恢复。
- Gitee 与 GitHub `main` 最终指向同一提交。
- OAuth discovery、DCR 与 Token 端点正常，两个实际客户端分别显示为独立 Agent。
- 撤销其中一个 Agent 后立即返回 401，其他 Agent 不受影响。

ICP备案、云账号 Secret、后台密码轮换和异地快照属于所有权边界内的外部动作；其余常规部署、巡检、备份和恢复验证由脚本与流水线完成。
