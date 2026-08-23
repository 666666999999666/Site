# QZ Site 灾难恢复手册

> **文档定位**：本文处理云盘损坏、整机丢失、数据库不可用或误操作后的恢复。日常发布和维护见 [`operations.md`](operations.md)。最后核对日期为 **2026-08-23**。

## 1. 恢复对象

| 资产 | 正常来源 | 丢失影响 |
|---|---|---|
| 应用代码 | Gitee `main`，GitHub 镜像 | 可重新拉取 |
| Web 镜像 | TCR `lqzzql/web@sha256:...` | 可由 Gitee 重新构建 |
| PostgreSQL | `data/postgres`，`backups/*.dump` | 文章、Todo、项目、设置、用户和问题学习记录丢失 |
| 公开上传 | `data/uploads`，`backups/*-uploads.tar.gz` | 正文图片和项目封面丢失 |
| 私有题图 | `data/study-uploads`，`backups/*-study-uploads.tar.gz` | 问题中的私有图片丢失或与数据库记录不一致 |
| 生产配置 | 服务器 `.env` | 服务无法连接数据库或验证 Session |
| TLS 文件 | `nginx/certs` | HTTPS 无法启动 |
| Gitee Agent 身份 | `/home/ubuntu/.gitee-agent` | CI 无法在生产机执行 |

数据库 dump、公开 uploads 和私有题图必须来自同一 `BACKUP_SET`。只恢复其中一份或混用不同时间戳，可能造成正文或问题引用与实际文件不一致。“问题中学”上线前且数据库中没有 Questions 表的旧备份可以没有私有题图归档；验证脚本会保留这条兼容路径。数据库中一旦存在 Questions 表，缺少同组私有题图归档必须停止恢复。

## 2. 当前保护状态

**已经自动化**

- 每日 03:00 创建数据库、公开 uploads、私有题图和 SHA-256 完整备份集。
- 每日 03:20 在先备份的前提下清理孤立私有题图和过期答案摘要。
- 每周日 03:30 在隔离 PostgreSQL 容器真实执行恢复验证。
- 部署、正文转换和上传清理前自动创建备份。
- 备份保留 30 天。
- Git 代码在 Gitee 和 GitHub 保留，运行镜像在 TCR 保留。

**尚需站点所有者完成的外部保护**

- 为腾讯云系统盘/数据盘启用自动快照或其他异地备份。
- 确认 `.env`、TLS 证书和 Gitee Agent 重建信息有独立于该云盘的安全副本。

本机 `backups/` 与数据库位于同一台服务器，能处理误操作和应用故障，不能处理整块云盘丢失。未启用并验证异地副本前，不得宣称具备整机灾难恢复能力。

## 3. RPO 与 RTO

以下是当前规模下的**运维目标，不是服务等级承诺**：

| 场景 | RPO 目标 | RTO 目标 | 当前可信度 |
|---|---:|---:|---|
| 应用发布失败 | 0 数据丢失 | 15 分钟内回滚 | 部署脚本已覆盖 |
| 数据误操作且服务器可用 | 最多 24 小时；高风险操作前接近 0 | 60 分钟内 | 每周隔离恢复验证 |
| 整机或云盘丢失 | 未配置异地副本时无法保证 | 无法保证 | 外部快照尚待确认 |

生产数据量当前较小，但完整生产替换恢复尚未作为常规操作执行。RTO 只能在一次异地恢复演练后改为“已验证”。

## 4. 事故响应顺序

1. 停止自动发布和会继续写数据的后台操作。
2. 不删除故障容器、数据库目录、备份或日志。
3. 记录当前 Git 提交、`.deploy-state`、容器状态和故障时间。
4. 若磁盘仍可读，先执行一次带故障标签的冷备份或复制原目录。
5. 选择故障发生前最近一个 SHA-256、两类上传安全隔离解包与数据库隔离恢复均通过的 `BACKUP_SET`。
6. 先在隔离容器验证，再恢复生产。
7. 恢复后执行来源校验、公开冒烟和数据数量核对。

不要在未留存故障现场时反复运行 migration、`db push`、Seed 或来源不明的 SQL。

## 5. 服务器仍可用时恢复

### 5.1 选择并验证备份

```bash
ls -lt backups/qzsite-*.dump
bash ops/verify-backup.sh backups/qzsite-<timestamp>-<label>.dump
```

验证必须完整成功后才能继续。该命令不仅列出归档，还会拒绝路径穿越、异常根目录、链接、重复项和非普通文件，把公开与私有上传解包到一次性隔离目录；若数据库包含 Questions 表，还会逐一校验私有题图文件的大小和 SHA-256。

### 5.2 停止写入

```bash
docker compose --env-file .env stop web nginx
```

停止后再确认没有管理操作仍在执行。数据库容器保持运行。

### 5.3 恢复数据库

```bash
docker compose --env-file .env exec -T db sh -ceu '
  dropdb --if-exists --force --username "$POSTGRES_USER" "$POSTGRES_DB"
  createdb --username "$POSTGRES_USER" "$POSTGRES_DB"
'

docker compose --env-file .env exec -T db sh -ceu '
  exec pg_restore \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --no-owner \
    --no-acl
' < backups/qzsite-<timestamp>-<label>.dump
```

### 5.4 恢复同组公开 uploads 与私有题图

只使用刚由 `verify-backup.sh` 验证通过的同一组归档。先在 `data` 下创建隔离暂存目录，再解包；不要直接把未验证归档覆盖到生产目录：

```bash
restore_stage="$(mktemp -d "$PWD/data/.restore.XXXXXX")"
tar --extract --gzip \
  --file backups/qzsite-<timestamp>-<label>-uploads.tar.gz \
  --directory "$restore_stage" \
  --no-same-owner --no-same-permissions --delay-directory-restore

if [[ -f backups/qzsite-<timestamp>-<label>-study-uploads.tar.gz ]]; then
  tar --extract --gzip \
    --file backups/qzsite-<timestamp>-<label>-study-uploads.tar.gz \
    --directory "$restore_stage" \
    --no-same-owner --no-same-permissions --delay-directory-restore
else
  # 仅允许 verify-backup.sh 已确认“不含 Questions 表”的旧备份走此分支。
  mkdir "$restore_stage/study-uploads"
fi

test -d "$restore_stage/uploads" && test ! -L "$restore_stage/uploads"
test -d "$restore_stage/study-uploads" && test ! -L "$restore_stage/study-uploads"
```

保留当前两个目录后再成组切换：

```bash
restore_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -e data/uploads || -L data/uploads ]]; then
  mv data/uploads "data/uploads.before-restore-$restore_stamp"
fi
if [[ -e data/study-uploads || -L data/study-uploads ]]; then
  mv data/study-uploads "data/study-uploads.before-restore-$restore_stamp"
fi
mv "$restore_stage/uploads" data/uploads
mv "$restore_stage/study-uploads" data/study-uploads
rmdir "$restore_stage"

# 使用 .env 中已拉取的 WEB_IMAGE，把私有目录恢复为该镜像的实际
# 非 Root UID/GID，并完成读、写、tar 探针；失败时不要启动 Web。
bash ops/prepare-study-uploads.sh
```

私有目录必须继续由 Web 容器的非 Root 运行身份读写。上面的准备脚本不依赖宿主机维护用户与容器 UID/GID 恰好相同，会将目录设为 `0750`，按镜像实际身份修正归属，并以默认非 Root 用户执行写入和 tar 探针。不要通过放宽到全局可写权限来绕过检查；后续 `ops/deploy.sh` 还会以候选镜像重复同一检查。

### 5.5 启动和验证

```bash
docker compose --env-file .env up --detach --wait --wait-timeout 240
bash ops/maintenance.sh status
bash ops/content-migration.sh --dry-run
bash ops/cleanup-uploads.sh --dry-run
```

核对文章、Todo、项目、用户、问题、复习记录和 migration 数量，并抽查公开图片与私有题图。确认恢复正确前保留 `uploads.before-restore-*`、`study-uploads.before-restore-*` 和故障现场备份。

## 6. 新服务器恢复

1. 创建与原机兼容的 Linux 主机，安装 Git、Docker Engine 和 Compose plugin。
2. 从 Gitee 克隆 `main` 到 `/home/ubuntu/个人网站`。
3. 从安全副本恢复 `.env`、TLS 文件和需要恢复的完整 `BACKUP_SET`。
4. 创建 `data/postgres`、`data/uploads`、`data/study-uploads`、`backups`，权限只授予运维用户；不要把私有题图放进 `public` 或 Nginx 静态目录。
5. 使用 `.env` 中记录的 Web digest 拉取镜像，只启动数据库：

```bash
docker compose --env-file .env pull db web nginx
docker compose --env-file .env up --detach --wait db
```

6. 按第 5 节从同一 `BACKUP_SET` 恢复数据库、公开 uploads 和私有题图，并在启动 Web 前执行其中的 `bash ops/prepare-study-uploads.sh`；旧备份缺少私有题图归档时，必须先由验证脚本确认其数据库不含 Questions 表。
7. 运行 `ops/deploy-entry.sh origin/main <web-image>`，让脚本完成完整备份、migration、Compose 切换、冒烟和 `.deploy-state` 重建。此时 Web 服务可以仍未启动：新版备份会使用 `.env` 中已拉取的本地 Web 镜像启动隔离的一次性非 Root 容器读取私有目录，不依赖 `compose exec web`。
8. 安装或重新绑定 Gitee Agent，确认自动部署流水线可用；`pipeline-maintenance.yml` 只保留为手动应急入口。
9. 从受信任的主机登录会话运行 `bash ops/maintenance.sh install-cron`，随后用 `crontab -l` 确认每日 03:20 的 `study-uploads` 条目，再执行 `mcp` 和 `status`，确认用户 Cron 与 `backups/maintenance.log` 正常。该安装是幂等操作，不由应用发布或 Gitee Agent 代办。

不得从本地开发数据库、Seed 或空上传目录补生产数据。

## 7. 演练频率

| 演练 | 频率 | 当前自动化 |
|---|---|---|
| SHA-256 与 PostgreSQL 隔离恢复 | 每周 | 已自动化 |
| 公开与私有上传安全隔离解包、题图完整性核对 | 每周 | 已自动化 |
| 发布回滚与来源校验 | 每次失败或重要发布 | 部署脚本自动化 |
| 新服务器/异地快照恢复 | 每 6 个月或基础设施变更后 | 需要云账号环境 |

异地演练使用临时主机或快照克隆，不在 2 核 2G 生产机上并行执行。演练结束后删除临时主机和临时凭据，并在本文记录日期、备份集和实际耗时。
