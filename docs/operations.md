# 生产运维手册

## 1. 边界

**生产数据库和 `data/uploads` 是事实来源**。本地数据库只用于 migration、转换和恢复演练，不能反向覆盖生产数据。

以下操作必须先有同一时点的数据库与上传文件备份：

- Prisma migration 首次上线
- Tiptap JSON 转 Markdown
- 孤儿上传清理
- 可能写入生产数据的人工修复

## 2. 部署

正常路径是推送 `main` 到 Gitee，并将同一提交同步到 GitHub 作为仓库镜像。Gitee Go 构建完成后，自有 Agent 调用 `ops/deploy.sh`，不依赖个人电脑 SSH；GitHub 当前不执行部署或生产维护。

生产机是 2 核 2G 规格。Gitee 的 `build@docker` 负责镜像编译；生产机 Agent 仅允许 `git fetch`、备份、拉取镜像、migration、Compose 切换和健康检查。禁止在生产机执行 `docker build`、`npm ci`、`next build` 或完整测试。

仓库中当前有 **2 份 Gitee Go 流水线定义**，但只有一份负责部署：

| 流水线 | 配置文件 | 触发方式 | 用途 | 验证状态 |
|---|---|---|---|---|
| `pipeline-deploy` | `.workflow/pipeline-deploy.yml` | 推送 `main` | 云端构建 `web` 镜像并部署生产 | 已多次实际运行通过 |
| `pipeline-maintenance` | `.workflow/pipeline-maintenance.yml` | 手动 | 执行固定白名单维护动作 | 配置已提交；需在 Gitee UI 手动执行 `status` 完成平台验证 |

“配置已存在”和“平台已运行”必须分开记录。若 Gitee 流水线列表尚未显示 `pipeline-maintenance`，应在 Gitee Go 页面从仓库配置创建或导入该流水线；首次只运行默认 `status`，确认 Agent、变量和脚本路径正确。它不是第二条自动部署链路。

Compose 的常驻内存上限为：PostgreSQL 512MB、Web 768MB、Nginx 128MB。主机配置 1GB 应急 Swap，`vm.swappiness=10`；Swap 只用于短时尖峰，不可作为在生产机编译的依据。备份恢复验证临时 PostgreSQL 上限为 384MB，且不得与部署、正文迁移或上传清理并发执行。

TCR 镜像仓库分工如下：

| 仓库 | 用途 | 当前要求 |
|---|---|---|
| `lqzzql/node` | Gitee 云端构建的 Node 基础镜像 | 保留 |
| `lqzzql/web` | 本站运行镜像 | 保留，每次发布生成 |
| `lqzzql/postgres` | PostgreSQL 16 固定版本镜像 | 建议创建私有仓库 |
| `lqzzql/nginx` | Nginx Alpine 固定版本镜像 | 建议创建私有仓库 |

`postgres` 和 `nginx` 是拉取加速与 Docker Hub 故障隔离，不是新增服务。仓库尚未创建或镜像尚未推送成功时，Compose 必须继续使用已经验证并缓存的官方 digest；切换 TCR 时同样固定到推送后的 digest，不使用浮动 tag。

部署成功必须同时满足：

1. `db`、`web`、`nginx` 为 Healthy。
2. `GET https://liaoqizai.site/api/health` 返回 200。
3. `.env` 中 `WEB_IMAGE` 已保存为 `@sha256:` digest。
4. 部署前备份已经完成且通过结构校验。

部署失败时脚本会恢复上一代码提交与镜像。migration 不自动回滚，因此 migration 必须优先采用新增 nullable 字段、兼容读写和后续清理的方式。

## 3. 当前 migration

`20260729030000_project_cover_and_setting_keys` 做两件事：

1. 为 `Project` 新增 nullable `coverImage`，旧应用可忽略。
2. 当规范键 `email` 不存在或为空时，从旧键 `about_email` 复制值，不删除旧数据。

如必须回退旧应用，可保留这次数据库变更。若确认不再需要封面字段，先备份，再人工执行 `ALTER TABLE "Project" DROP COLUMN "coverImage"`；设置键不需要回滚。

## 4. 正文转换

```bash
bash ops/content-migration.sh --dry-run
bash ops/content-migration.sh --apply
bash ops/content-migration.sh --dry-run
```

最后一次 dry-run 应报告 0 篇 Tiptap JSON。转换脚本不会删除文章，发生异常时事务整体回滚。已经提交的转换只能通过 `content-migration` 或 `predeploy` 备份恢复原正文。

## 5. 备份验证

创建并验证最新备份：

```bash
bash ops/maintenance.sh backup
bash ops/maintenance.sh verify-backup
```

验证失败时：

1. 不执行正文转换、上传清理或新 migration。
2. 保留失败备份和日志。
3. 检查磁盘空间、数据库健康状态、dump 大小和 SHA-256。
4. 修复后重新创建完整备份集并再次恢复。

灾难恢复时，先恢复 PostgreSQL dump，再解压同一 `BACKUP_SET` 的 uploads 压缩包。不要混用不同时间点的数据库和上传备份。

## 6. 固定维护入口

`ops/maintenance.sh` 仅允许：

| 动作 | 影响 |
|---|---|
| `status` | 只读检查容器和 HTTPS 健康 |
| `backup` | 创建新备份集 |
| `verify-backup` | 在隔离容器恢复最新备份 |
| `ssl` | 检查 30 天证书余量和 HTTPS |
| `content-dry-run` | 只读扫描旧正文 |
| `uploads-dry-run` | 只读扫描孤儿上传 |

Gitee Go 的 `pipeline-maintenance` 手动流水线通过 `MAINTENANCE_ACTION` 暴露以上固定选项，不接受任意 Shell 命令。未填写参数时只执行 `status`。

## 7. 密钥与权限

- `.env`、备份文件、证书私钥权限为 `600`，目录为 `700`。
- `data/uploads` 由容器内固定的非 Root `node` 用户写入。
- 镜像仓库密码通过 `docker login --password-stdin` 传入，并在任务结束时 logout。
- 轮换 `SESSION_SECRET` 后重启 Web，使旧 Session 全部失效。
- 后台密码曾经通过聊天传输时必须由站点所有者在后台改为新的独立长密码，不能写入仓库、脚本、日志或聊天。
- 个人 SSH 公钥只在 Gitee Go、备份恢复和线上回归全部通过后移除。Gitee Agent 使用出站连接，不依赖登录公钥；紧急操作走云控制台。

Gitee Go 自有 Agent 由主机的 `gitee-go-agent.service` 管理，并限制为 256MB 内存和 50% CPU。云控制台应急检查执行 `systemctl is-active gitee-go-agent.service`；服务异常时执行 `sudo systemctl restart gitee-go-agent.service`。Agent 正常停止会先向 Gitee 注销，服务端释放旧注册存在数分钟延迟；2026-07-29 实测 systemd 自动重试约 4 分 30 秒后恢复 Active。重启后先等待 6 分钟，再检查 `systemctl status gitee-go-agent.service`；连续 10 分钟仍未恢复才在 Gitee 主机组中重新绑定，不要提前删除 UUID。Agent UUID 只保存在服务器 `/home/ubuntu/.gitee-agent/uuid`，权限为 `600`，不得复制到仓库或流水线日志。

`ops/check-ssl.sh` 通过 `127.0.0.1` 验证本机 Nginx 的正式域名虚拟主机、证书余量和健康接口，不替代公网监控。ICP备案完成前，云侧可能重置带正式域名 SNI 的外部 TLS 连接；备案接入完成后应再从境外和境内各保留一个外部可用性检查。

## 8. 发布后检查

```text
/zh
/zh/blog
/zh/projects
/zh/about
/admin
/api/health
/sitemap.xml
/robots.txt
```

同时核对：

- 生产文章、项目、Todo、用户数量未意外变化。
- 旧正文扫描为 0。
- 新 migration 只执行一次。
- 上传文件在容器重建后仍可读取。
- 未登录管理写接口返回 401。
- 安全响应头和正式域名证书正常。
