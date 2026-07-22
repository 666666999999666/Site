# QZ Site

个人数字花园 —— 一个以博客为核心，结合私人知识管理和 Todo 管理的个人网站。

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- Tiptap 编辑器
- PostgreSQL + Prisma ORM

## 本地开发

```bash
npm install
npm run dev
```

## 部署

推送代码到 main 分支即可自动部署：

```
git push origin main
  → GitHub + Gitee 同时收到代码
  → Gitee Go 自动触发 → 国内构建 → 推送 ACR → 部署到服务器
```

### 服务器维护

| 任务 | 方式 | 频率 |
|------|------|------|
| 数据库备份 | crontab 自动执行 `backup-db.sh` | 每天凌晨 3 点 |
| SSL 证书检查 | crontab 自动执行 `check-ssl.sh` | 每周一 9 点 |
| SSL 证书续期 | 腾讯云 SSL 控制台续期 + 替换 `nginx/certs/` | 到期前（证书有效期 3 个月） |

### 服务器重装恢复

1. 安装 Docker + Docker Compose
2. 克隆仓库，配置 `.env`（参考 `.env.example` 生产部署部分）
3. 配置 SSL 证书到 `nginx/certs/`
4. `docker compose up -d`
5. 安装 Gitee Go Agent
6. 配置 crontab（backup-db.sh + check-ssl.sh）
