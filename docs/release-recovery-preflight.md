# 发布前部署与恢复验收

日期：2026-10-20。基线：`552ac36`。本报告只证明本地脚本合同与隔离 fixture 测试，不证明容器已构建、生产已上线或生产备份可恢复。

## 结论

本轮增加 `tests/release-recovery-execution.test.ts`，未改动运维运行脚本、备份保留策略、生产配置或真实数据。相关 47 项测试全部通过；`ops/*.sh` 全部通过 `bash -n`。

执行命令：

```bash
node --import tsx --test \
  tests/release-recovery-execution.test.ts \
  tests/cleanup-backup-precondition.test.ts \
  tests/backup-restore.test.ts \
  tests/deployment-workflow.test.ts \
  tests/storage-governance.test.ts \
  tests/candidate-migration-gate.test.ts
for f in ops/*.sh; do bash -n "$f" || exit; done
```

使用 Node 导入 tsx 的方式运行测试，避免当前环境禁止 tsx CLI 的 IPC socket；没有降低测试断言。

## 已执行验证

- 发布身份链：实际执行 `verify-release.sh`。Git SHA、工作树脏状态、配置 digest、OCI revision、镜像/容器 release SHA、容器运行状态、镜像 ID、镜像/源码 fingerprint 和 health SHA 不匹配均拒绝；严格镜像不能绕到 legacy 路径。
- 公网健康门禁：实际执行 `smoke-test.sh public`，模拟 HTTP 失败、不健康状态、缺失/无效/错误 release SHA，均在路由检查前退出；公网请求未附加回环 `--resolve`。
- 中断确认：实际执行 watchdog。候选稳定状态已写入且校验通过时，只补历史并清除 pending，不重新部署；无 pending 时无外部操作；未超时 pending 保持不动。
- 回滚：过期 pending 使用本地镜像且 `--pull never`；恢复准备、smoke、provenance 任一步失败均保留 pending。镜像不存在或状态冲突时拒绝继续。候选确认失败进入旧版本恢复，恢复验证失败仍保留证据。
- 备份：真实 tar/sha256 工具处理合成数据；摘要不匹配、重复清单、上传归档符号链接均在数据库操作前拒绝。模拟 pg_restore 失败时不写“已验证”标记且执行容器清理；模拟 Questions schema 存在但私有题图归档缺失时拒绝通过。
- 清理前置：现有执行测试逐一移除四个备份集文件，公开/私有上传清理均拒绝；独立备份与 dry-run 行为保留。
- 保留策略 dry-run：原样执行 backup.sh 的 retention 段，仅把 rm 替换成记录器。测试 count-based predeploy/cleanup/migration 选择及保护最新、已验证、手动、不完整备份集；所有 fixture 文件仍存在。未执行任何真实保留删除，也未修改策略。补充用真实 fixture mtime 验证 scheduled 过期分支，用 stat 尺寸 mock 验证 1 GiB 配额分支：优先删除未保护旧 predeploy、保护最新/已验证/手动集，仍超配额时保留并告警；未分配大文件，也未真实删除保留候选。

## 明确未验证的边界

实际镜像构建受环境限制阻塞：当前没有 Docker/Podman daemon/socket；官方 BuildKit v0.34.0 的 rootless/native-snapshotter 启动在任何镜像构建前退出 1，报 `failed to create unix socket on /tmp/qz-buildkit.sock: listen unix /tmp/qz-buildkit.sock: socket: operation not permitted`。未尝试替换监听方式或绕过权限。source manifest 打包已独立验证，但实际镜像未构建，因此容器部署和真实数据库恢复不能据此标为通过。

Docker、Git 及 smoke/prepare 依赖在执行测试中为 mocks；tar/hash 为真实工具。此次不是实际 Docker/Compose、PostgreSQL 恢复或完整 deploy.sh 的端到端演练。实际网络、DNS/TLS、镜像仓库凭证、生产容量、Cron 权限和生产数据兼容性均未测试。候选迁移 gate 的现有测试为脚本合同检查，不等同真实数据库迁移成功。

## 目标环境上线检查单（尚未执行）

1. 明确批准发布目的地和精确提交；确认工作树干净。按仓库既有唯一生产源 Gitee 流程发布，不用 latest，不把仓库同步成功视为上线成功。
2. 在目标主机确认应用所有者权限、全局锁、至少 5 GiB 空间、固定 digest 的依赖镜像、旧稳定镜像和源码可用；核查受信任会话安装的 watchdog/Cron。不要为 Agent 放宽主机安全限制。
3. 在 CI／非生产构建机上构建（禁止在生产主机上构建），并核对候选不可变 digest、完整 SHA、OCI revision、APP_RELEASE_SHA 和源码 manifest/fingerprint。
4. 生成同组数据库、公开 uploads、私有 study-uploads 与 sha256 清单；在隔离 PostgreSQL 中恢复验证，核对 QuestionImage 文件大小与摘要。生产备份内容不得拷入当前测试环境。
5. 用最终候选镜像对一次性数据库副本执行迁移 gate，并确认双次迁移及保护数据检查通过。Prisma migration 不会随代码回滚逆转，必须预先确认向后兼容。
6. 仅经授权运行既有 deploy-entry，保留 pending 直至内部和真实公网 smoke、release identity 验证通过。
7. 核对 `.deploy-state`、稳定历史、实际运行镜像、源代码、health SHA 一致且 pending 已清除；运行只读 `maintenance.sh status`。
8. 若失败，核查回滚后的内部/公网健康及 identity；未验证恢复完成前不得手动清除 pending。生产端的恢复演练、RPO/RTO、离机备份可用性仍需独立留证。
