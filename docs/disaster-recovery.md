# QZ Site 灾难恢复手册

> **文档定位**：本文处理云盘损坏、整机丢失、数据库不可用或误操作后的恢复。日常发布和维护见 [`operations.md`](operations.md)。最后核对日期为 **2026-07-29**。

## 1. 恢复对象

| 资产 | 正常来源 | 丢失影响 |
|---|---|---|
| 应用代码 | Gitee `main`，GitHub 镜像 | 可重新拉取 |
| Web 镜像 | TCR `lqzzql/web@sha256:...` | 可由 Gitee 重新构建 |
| PostgreSQL | `data/postgres`，`backups/*.dump` | 文章、Todo、项目、设置和用户丢失 |
| 上传文件 | `data/uploads`，`backups/*-uploads.tar.gz` | 正文图片和项目封面丢失 |
| 生产配置 | 服务器 `.env` | 服务无法连接数据库或验证 Session |
| TLS 文件 | `nginx/certs` | HTTPS 无法启动 |
| Gitee Agent 身份 | `/home/ubuntu/.gitee-agent` | CI 无法在生产机执行 |

数据库 dump 和对应 uploads 压缩包必须来自同一 `BACKUP_SET`。只恢复其中一份可能造成正文引用与实际文件不一致。

## 2. 当前保护状态

**已经自动化**

- 每日 03:00 创建数据库、uploads 和 SHA-256 完整备份集。
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
5. 选择故障发生前最近一个 SHA-256 与隔离恢复均通过的 `BACKUP_SET`。
6. 先在隔离容器验证，再恢复生产。
7. 恢复后执行来源校验、公开冒烟和数据数量核对。

不要在未留存故障现场时反复运行 migration、`db push`、Seed 或来源不明的 SQL。

## 5. 服务器仍可用时恢复

### 5.1 选择并验证备份

```bash
ls -lt backups/qzsite-*.dump
bash ops/verify-backup.sh backups/qzsite-<timestamp>-<label>.dump
```

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

### 5.4 恢复同组 uploads

先确认归档只包含 `uploads/`：

```bash
tar --list --gzip --file backups/qzsite-<timestamp>-<label>-uploads.tar.gz
```

保留当前目录后再恢复：

```bash
mv data/uploads "data/uploads.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
tar --extract --gzip \
  --file backups/qzsite-<timestamp>-<label>-uploads.tar.gz \
  --directory data
```

### 5.5 启动和验证

```bash
docker compose --env-file .env up --detach --wait --wait-timeout 240
bash ops/maintenance.sh status
bash ops/content-migration.sh --dry-run
bash ops/cleanup-uploads.sh --dry-run
```

核对文章、Todo、项目、用户和 migration 数量。确认恢复正确前保留 `uploads.before-restore-*` 和故障现场备份。

## 6. 新服务器恢复

1. 创建与原机兼容的 Linux 主机，安装 Git、Docker Engine 和 Compose plugin。
2. 从 Gitee 克隆 `main` 到 `/home/ubuntu/个人网站`。
3. 从安全副本恢复 `.env`、TLS 文件和需要恢复的完整 `BACKUP_SET`。
4. 创建 `data/postgres`、`data/uploads`、`backups`，权限只授予运维用户。
5. 使用 `.env` 中记录的 Web digest 拉取镜像，只启动数据库：

```bash
docker compose --env-file .env pull db web nginx
docker compose --env-file .env up --detach --wait db
```

6. 按第 5 节恢复数据库和 uploads。
7. 运行 `ops/deploy.sh origin/main <web-image>`，让脚本完成完整备份、migration、Compose 切换、冒烟和 `.deploy-state` 重建。
8. 运行 `bash ops/maintenance.sh install-cron`。
9. 安装或重新绑定 Gitee Agent，并确认自动部署的 `status` 阶段通过。

不得从本地开发数据库、Seed 或空上传目录补生产数据。

## 7. 演练频率

| 演练 | 频率 | 当前自动化 |
|---|---|---|
| SHA-256 与 PostgreSQL 隔离恢复 | 每周 | 已自动化 |
| 发布回滚与来源校验 | 每次失败或重要发布 | 部署脚本自动化 |
| 新服务器/异地快照恢复 | 每 6 个月或基础设施变更后 | 需要云账号环境 |

异地演练使用临时主机或快照克隆，不在 2 核 2G 生产机上并行执行。演练结束后删除临时主机和临时凭据，并在本文记录日期、备份集和实际耗时。
