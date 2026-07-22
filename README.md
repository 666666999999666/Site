# QZ Site

个人数字花园 —— 一个以博客为核心，结合私人知识管理和 Todo 管理的个人网站。

## 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **编辑器**: Tiptap（富文本博客编辑）
- **数据库**: PostgreSQL 16 + Prisma ORM
- **部署**: Docker + Docker Compose
- **CI/CD**: Gitee Go（主）+ GitHub Actions（备份）

## 项目结构

```
├── app/                    # Next.js App Router
│   ├── [locale]/           # 国际化路由（中/英）
│   │   ├── about/          # 关于页
│   │   ├── blog/           # 博客列表+详情
│   │   └── projects/       # 项目展示
│   ├── admin/              # 后台管理
│   │   ├── posts/          # 文章管理
│   │   ├── projects/       # 项目管理
│   │   ├── settings/       # 站点设置
│   │   └── todos/          # Todo 管理
│   └── api/                # API 路由
├── components/             # React 组件
├── lib/                    # 工具库（auth, db, api）
├── prisma/                 # 数据库 Schema
├── nginx/                  # Nginx 配置
├── messages/               # i18n 翻译文件
├── Dockerfile              # 多阶段 Docker 构建
├── docker-compose.yml      # 生产部署编排
├── .github/workflows/      # GitHub Actions（备份 CI/CD）
└── .workflow/              # Gitee Go 流水线配置（主 CI/CD）
```

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入本地数据库密码等

# 3. 初始化数据库
npx prisma db push
npx prisma db seed

# 4. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 部署

### CI/CD 流程

```
git push origin main
  ├── GitHub（备份仓库）
  └── Gitee（主仓库）
       └── Gitee Go 自动触发
            ├── 镜像构建：build@docker
            │   ├── 从腾讯云 ACR 拉取基础镜像（内网加速）
            │   ├── npm install（npmmirror 加速）
            │   ├── Next.js 构建（buildkit 缓存）
            │   └── 推送镜像到腾讯云 ACR
            └── 部署：shell@agent
                ├── docker login
                ├── docker compose pull web
                ├── docker compose up -d web
                └── docker image prune -f
```

**只需 `git push origin main`，3-5 分钟自动部署完成。**

### 环境变量

#### 本地开发（.env）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 本地 PostgreSQL 连接串 |
| `SEED_PASSWORD` | 种子数据初始密码 |
| `SESSION_SECRET` | 会话加密密钥（32+ 字符随机串） |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL |
| `NEXT_PUBLIC_GITHUB_URL` | GitHub 主页链接 |

#### 生产环境（服务器 .env）

| 变量 | 说明 |
|------|------|
| `DB_NAME` | 数据库名 |
| `DB_USER` | 数据库用户 |
| `DB_PASSWORD` | 数据库密码 |
| `SESSION_SECRET` | 会话加密密钥 |
| `NEXT_PUBLIC_SITE_URL` | `https://你的域名` |
| `NEXT_PUBLIC_GITHUB_URL` | GitHub 主页链接 |

#### CI/CD 环境变量（Gitee Go 流水线设置）

| 变量 | 说明 |
|------|------|
| `TCR_USERNAME` | 腾讯云 ACR 用户名 |
| `TCR_PASSWORD` | 腾讯云 ACR 密码 |

#### GitHub Actions Secrets（备份 CI/CD）

| Secret | 说明 |
|--------|------|
| `TCR_USERNAME` | 腾讯云 ACR 用户名 |
| `TCR_PASSWORD` | 腾讯云 ACR 密码 |
| `SERVER_HOST` | 服务器 IP |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_SSH_KEY` | SSH 私钥 |
| `SERVER_APP_DIR` | 应用目录 |

## 服务器维护

### 自动化任务（crontab）

| 任务 | 命令 | 频率 |
|------|------|------|
| 数据库备份 | `backup-db.sh` | 每天凌晨 3 点 |
| SSL 证书检查 | `check-ssl.sh` | 每周一 9 点 |

### 手动维护

| 任务 | 方式 |
|------|------|
| SSL 证书续期 | 腾讯云 SSL 控制台续期 → 替换 `nginx/certs/` → `docker compose restart nginx` |
| 查看数据库备份 | `ls ~/backups/` |
| 查看容器状态 | `docker ps` |
| 查看网站日志 | `docker logs qzsite-web-1 --tail 50` |
| 手动触发部署 | Gitee Go 流水线页面 → 手动触发（或 `git push origin main`） |
| GitHub Actions 备份部署 | GitHub Actions 页面 → Run workflow（手动） |

### 数据库

数据库数据存储在 Docker volume `./data/postgres/`，与 CI/CD 解耦：
- 每次 `git push` 只重建 web 容器，数据库不受影响
- 数据库备份文件在 `~/backups/`，每天自动生成

### 服务器重装恢复

1. 安装 Docker + Docker Compose
2. 克隆仓库到 `/home/ubuntu/个人网站`
3. 配置 `.env`（参考 `.env.example` 生产部署部分）
4. 配置 SSL 证书到 `nginx/certs/`
5. `docker compose up -d`
6. 安装 Gitee Go Agent（参考 Gitee Go 文档）
7. 配置 crontab：`backup-db.sh` + `check-ssl.sh`

## 基础设施

| 组件 | 平台 | 说明 |
|------|------|------|
| 服务器 | 腾讯云 CVM | Ubuntu 22.04 |
| 镜像仓库 | 腾讯云 ACR | `ccr.ccs.tencentyun.com/lqzzql/` |
| CI/CD（主） | Gitee Go | push 触发，agent 部署 |
| CI/CD（备份） | GitHub Actions | 手动触发，SSH 部署 |
| 域名 | `liaoqizai.site` | SSL 已配置 |
| 代码仓库 | GitHub + Gitee | `git push origin main` 同时推送 |
