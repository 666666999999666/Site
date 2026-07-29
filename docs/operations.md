# QZ Site 生产运维手册

> **文档定位**：本文是当前生产操作的唯一常规手册，最后核对日期为 **2026-07-29**。整机或磁盘故障恢复见 [`disaster-recovery.md`](disaster-recovery.md)。

## 1. 运维边界

**生产 PostgreSQL 和 `data/uploads` 是内容事实来源**。本地数据库、Seed 数据和本地上传不能覆盖生产数据。

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
| `pipeline-deploy` | 推送 Gitee `main` | 云端构建、推送 Web 镜像、生产部署、自动 `status` 检查 |
| `pipeline-maintenance` | 手动 | 故障、临时备份、恢复验证或证书轮换时执行固定动作 |

两条流水线不是两套部署方式。日常发布只走 `pipeline-deploy`；`pipeline-maintenance` 是不接受任意 Shell 的受限应急入口。GitHub 只同步仓库，不运行生产 Action。

TCR 当前只需要：

| 仓库 | 用途 | 结论 |
|---|---|---|
| `lqzzql/node` | Gitee 云端构建基础镜像 | 必需，Dockerfile 固定 digest |
| `lqzzql/web` | 本站运行镜像 | 必需，构建推送 `latest`，运行使用 digest |
| `postgres`、`nginx` | 官方镜像缓存 | 当前不必创建；Compose 已固定官方 digest |

PostgreSQL 和 Nginx 镜像只在版本变更或新机器恢复时拉取，不值得为当前单机额外维护 TCR 副本。若未来 Docker Hub 在实际恢复中不可用，再镜像到 TCR，并把 Compose 更新为新仓库的固定 digest。

## 3. 自动部署

Gitee Agent 执行：

```bash
bash ops/deploy.sh origin/main ccr.ccs.tencentyun.com/lqzzql/web:latest
bash ops/maintenance.sh status
```

`ops/deploy.sh` 的顺序是：

1. 获取全局操作锁并确认目标提交属于 `origin/main`。
2. 创建 PostgreSQL、uploads 和 SHA-256 同时点备份。
3. 拉取候选 tag，并解析为不可变 `@sha256:` digest。
4. 切换到目标提交。
5. 对比目标源码与候选镜像内的 SHA-256 源码指纹。
6. 以 digest 更新 Compose，执行 migration 并等待三个服务 Healthy。
7. 验证 Nginx 配置并 reload。
8. 执行中英文页面、健康接口、未登录 Todo 写保护、robots 和 sitemap 冒烟测试。
9. 将 Git 提交、镜像 digest 和源码指纹写入 `.deploy-state`。
10. 再次核对运行容器、镜像、源码和 `.deploy-state`。

`latest` 只是候选镜像发现入口，不是生产运行标识。两次推送交错时，镜像与目标提交指纹不同会在容器切换前失败，避免部署错误代码。

部署失败会恢复上一代码提交、上一镜像和上一 `.deploy-state`。Prisma migration 不会自动逆转，因此 migration 必须向后兼容，优先新增 nullable 字段、兼容读写和后续清理。

部署成功至少满足：

```bash
bash ops/maintenance.sh status
```

该命令同时验证：

- `db`、`web`、`nginx` 正在运行。
- 当前 Git 提交与 `.deploy-state` 一致。
- Web 容器使用记录的镜像 digest。
- 运行镜像指纹与服务器源码一致。
- `/api/health`、`/zh`、`/en`、`robots.txt`、`sitemap.xml` 正常。
- 未登录 Todo 写请求返回 401。

## 4. 固定维护入口

`ops/maintenance.sh` 只接受以下动作：

| 动作 | 影响 |
|---|---|
| `status` | 只读检查容器、发布来源和公开冒烟 |
| `backup` | 创建完整生产备份集 |
| `verify-backup` | 在隔离 PostgreSQL 容器恢复最新备份 |
| `ssl` | 检查 30 天证书余量和本机 HTTPS |
| `install-cron` | 幂等安装本项目定时任务并移除两条旧任务 |
| `install-tls` | 校验证书和私钥后原子替换、测试并 reload |
| `content-dry-run` | 只读扫描旧 Tiptap 正文 |
| `uploads-dry-run` | 只读扫描孤儿上传 |

其他值会被拒绝。不得增加 `eval`、任意命令变量或通用远程 Shell。

## 5. 定时任务

安装或更新：

```bash
bash ops/maintenance.sh install-cron
```

脚本使用带标记的 crontab 区块，重复执行不会产生重复任务，并会删除旧的 `/home/ubuntu/backup-db.sh` 和 `/home/ubuntu/check-ssl.sh` 条目。当前计划：

| 时间 | 动作 | 资源控制 |
|---|---|---|
| 每日 03:00 | 完整数据库与 uploads 备份 | `nice -n 10` |
| 每周日 03:30 | 在临时容器真实恢复最新备份 | `nice -n 10`，384MB/0.75 CPU |
| 每周一 09:00 | 证书余量和 HTTPS 检查 | 轻量 |

统一日志位于 `backups/maintenance.log`。定时任务异常时先保留日志和失败备份，不要直接删除。

## 6. 备份与验证

手动创建和验证：

```bash
bash ops/maintenance.sh backup
bash ops/maintenance.sh verify-backup
```

每个 `BACKUP_SET` 包含：

- `qzsite-<timestamp>-<label>.dump`：PostgreSQL custom-format dump。
- `qzsite-<timestamp>-<label>-uploads.tar.gz`：同一时点的 uploads。
- `qzsite-<timestamp>-<label>.sha256`：两份文件的校验值。

备份默认保留 30 天。验证脚本会检查 SHA-256、uploads 归档结构，并在不映射端口的临时 PostgreSQL 16 容器中真实执行 `pg_restore`，读取文章、项目、设置、Todo、用户和 migration 数量后自动删除容器。

验证失败时：

1. 停止新 migration、正文转换、上传清理和人工修复。
2. 保留失败备份与 `maintenance.log`。
3. 检查磁盘、容器健康、dump 大小和 SHA-256。
4. 修复后重新创建完整备份集并再次验证。

本机备份不能抵御云盘或整机丢失。异地保护状态和完整恢复步骤见 [`disaster-recovery.md`](disaster-recovery.md)。

## 7. 证书检查与更新

常规检查：

```bash
bash ops/maintenance.sh ssl
```

`ops/check-ssl.sh` 校验证书至少还有 30 天，并通过 `127.0.0.1` 访问正式域名虚拟主机。它不等同于公网监控；备案接入稳定后仍应保留外部可用性检查。

更新证书时，在 Gitee Go 将以下值设为受保护变量：

- `TLS_CERT_B64`：完整证书链的 Base64。
- `TLS_KEY_B64`：未加密私钥的 Base64。
- `MAINTENANCE_ACTION=install-tls`。

`ops/install-tls.sh` 会自动：

1. 解码到权限为 `600` 的临时文件。
2. 校验域名、30 天有效期、私钥格式和公私钥匹配。
3. 将旧证书备份到 `backups/tls-<timestamp>/`。
4. 安装新文件，执行 `nginx -t`、reload 和 HTTPS 检查。
5. 任一步失败时恢复旧证书。

证书签发和把新凭据写入 Gitee Secret 依赖域名/云账号所有权，不能由仓库代码自行取得；安装和回滚过程已经自动化。

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
```

只有确认报告正确后才允许 `--apply`；脚本会先备份，并保留 24 小时保护期。

禁止在生产执行 `prisma db push`。生产只使用已提交的 `prisma migrate deploy`。

## 9. 密钥、Agent 与应急权限

- `.env`、备份、证书和私钥不进入 Git；文件权限为 `600`，目录为 `700`。
- TCR 密码只通过 Gitee Secret 和 `docker login --password-stdin` 使用，任务结束自动 logout。
- Web 使用非 Root `node` 用户，Nginx 只读挂载 uploads。
- 后台密码若曾经通过聊天传输，站点所有者必须在后台改为新的独立长密码。
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
- 上传文件在容器重建后仍可读取。
- 最新完整备份能够恢复。
- Gitee 与 GitHub `main` 最终指向同一提交。

ICP备案、云账号 Secret、后台密码轮换和异地快照属于所有权边界内的外部动作；其余常规部署、巡检、备份和恢复验证由脚本与流水线完成。
