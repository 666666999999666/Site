# 个人网站v3 建站全记录

> 本文档记录从零开始搭建 QZ Site 个人网站，以及 CI/CD 部署的完整心路历程。
> 所有内容来源于实际聊天对话，非 git 提交记录。
> 第一轮对话记录了建站和前四次 CI/CD 尝试；第二轮对话完成了 CI/CD 最终打通和功能完善。

---

## 一、建站起步

### 1.1 项目初始化

最初命名为"数字花园"，后来改成了 **QZ Site**。

技术栈：Next.js 16 + React 19 + Prisma 7 + PostgreSQL + Tailwind CSS + Docker。

### 1.2 核心功能

- **博客系统**：Tiptap 富文本编辑器，内容以 JSON 格式存储
- **Todo 列表**：个人待办事项管理
- **设置页面**：网站配置
- **管理后台**：后台管理功能
- **深色/浅色模式切换**：暖棕色系配色

### 1.3 踩过的坑（开发阶段）

**TypeScript 类型错误**：`scripts/seed-posts.ts` 里 `status: "PUBLISHED"` 被推断为 string 而不是 PostStatus 枚举。加了类型注解修好。

**水合不匹配（Hydration Mismatch）**：PostContent.tsx 组件里 `generateHTML` 在服务端和客户端输出不一致。修法：用 `useState("")` + `useEffect` 让 HTML 只在客户端生成。

**深色模式颜色奇怪**：搜了别人的配色方案，调到暖棕色系。

---

## 二、推送 GitHub

代码推到了 GitHub 仓库 `666666999999666/Site`，同时推到 Gitee 仓库 `lqzzql/Site`。

---

## 三、部署上云（腾讯云）

### 3.1 服务器环境

- 腾讯云服务器：`203.195.208.172`（2核4G，4Mbps 带宽）
- 操作系统：Ubuntu
- 用户：ubuntu
- 项目目录：`/home/ubuntu/个人网站/`

### 3.2 部署架构

Docker Compose 管理三个容器：
- **db**：postgres:16-alpine（数据库）
- **web**：Next.js 应用（自建镜像，推送到腾讯云 ACR）
- **nginx**：nginx:alpine（反向代理 + HTTPS）

### 3.3 踩过的坑（部署阶段）

**Docker Hub 拉取超时**：国内服务器访问 Docker Hub 特别慢，配了镜像加速器。

**Docker Compose 项目名为空**：中文目录名导致解析失败，加了 `name: qzsite`。

**Prisma 7 不支持 --skip-generate**：去掉参数后好了。

**ENV 文件格式问题**：反引号和 $ 符号导致变量解析错误，改用 `cat << 'EOF'` 方式创建。

**git 分支名不匹配**：本地 master，GitHub 默认 main，用 `git push origin master:main` 解决。

**数据库持久化问题**：数据存在宿主机磁盘 `./data/postgres/` 和 `./data/uploads/`，容器重启不影响。配了每天凌晨 4 点自动备份。

**502 Bad Gateway**：容器启动失败导致。

---

## 四、CI/CD 漫长征程（第一轮对话）

这是整个项目中**最艰难的部分**，第一轮对话尝试了五种方案都没完全打通。

### 4.1 方案一：GitHub Actions + ghcr.io

```
git push → GitHub Actions 构建镜像 → 推送到 ghcr.io → SSH 到服务器 → docker pull → 重启
```

**致命问题**：ghcr.io 太慢！234MB 镜像拉到 4Mbps 中国服务器，15 分钟都拉不完。

### 4.2 方案二：本地脚本部署（deploy.ps1）

```
本地 docker build → docker save 为 tar → scp 传到服务器 → docker load → docker compose up -d
```

能用，但是**手动的**，不算真正的 CI/CD。

### 4.3 方案三：SSH 直连服务器构建

```
git push → GitHub Actions SSH 到服务器 → git pull 源码 → docker build → docker compose up -d
```

**翻车**：2核4G 服务器跑 `docker build` + `next build`，资源被吃满，**SSH 都连不上了**！只能去腾讯云控制台重启服务器。

### 4.4 方案四：Actions 构建 + SSH 管道传输

```
git push → GitHub Actions 构建镜像 → docker save | gzip | ssh → 服务器 docker load → 重启
```

**再次翻车**：1.47GB 镜像压缩后约 500-600MB，4Mbps 带宽传输 30+ 分钟还没完成。

### 4.5 方案五：优化镜像体积（未完成）

镜像从 1.47GB 缩小到 466MB（减少 68%），但 prisma CLI 路径问题没修完，截止第一轮对话未验证通过。

---

## 五、CI/CD 最终打通（第二轮对话）

> 第二轮对话从 2026-07-23 凌晨开始，历经 9 个问题的排查，终于完全打通了 CI/CD 链路。

### 5.1 第六方案：Gitee Go + 腾讯云 ACR（最终方案）

**核心思路**：放弃 GitHub Actions，改用 Gitee Go 流水线 + 腾讯云容器镜像服务（TCR/ACR）。

**为什么选这个**：
- Gitee Go 的构建机器在腾讯云内网，推送到 TCR 走内网，速度极快
- ACR 免费额度足够个人项目使用
- Gitee Go 免费版支持自动触发 + Agent 部署

**最终流程**：
```
git push origin main
  → GitHub + Gitee 同步
  → Gitee Go 自动触发
  → build@docker: ACR内网拉取基础镜像 + npmmirror + buildkit缓存 → 构建镜像 → 推送 TCR
  → shell@agent: docker login → compose pull → compose up -d → prune
  → 部署完成 (~3分钟)
```

### 5.2 九个问题的排查历程

| # | 问题 | 现象 | 解决方案 |
|---|------|------|---------|
| 1 | Docker Hub 限流 | `429 Too Many Requests` | 推送 node:22-alpine 到腾讯云 ACR，Dockerfile 改用 ACR 镜像 |
| 2 | TCR 拉取认证失败 | `401 Unauthorized` | ACR 的 node 仓库设为公开（web 仓库保持私有） |
| 3 | npm install 慢 | 3+ 分钟下载包 | 换 npmmirror 镜像源（`--registry=https://registry.npmmirror.com`） |
| 4 | 构建无缓存 | 每次全量构建 | buildkit `--mount=type=cache` 挂载 npm 和 .next 缓存 |
| 5 | Next.js 16 构建报错 | `Middleware is missing expected function export name` | `middleware.ts` → `proxy.ts`（Next.js 16 废弃 middleware 改用 proxy） |
| 6 | TCR push 认证失败 | `insufficient_scope: authorization failed` | YAML 添加 `variables.global` 声明，确保 `${TCR_USERNAME}` 被正确替换 |
| 7 | Agent 不可用 | `agents not available | 主机组未关联 agent | 用户在 Gitee Go UI 中重新配置主机组，添加 agent UUID |
| 8 | Prisma 引擎下载失败 | `ECONNRESET` 下载 @prisma/engines | 设置 `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` |
| 9 | deploy@agent 强制下载制品 | `curl: (3) URL using bad/illegal format` | 改用 `shell@agent`（不下载构建产物，直接执行脚本） |

### 5.3 关键配置文件

**Dockerfile 优化要点**：
- 基础镜像：`ccr.ccs.tencentyun.com/lqzzql/node:22-alpine`（ACR 内网，3.5 秒拉取）
- npm 镜像源：`--registry=https://registry.npmmirror.com`
- Prisma 引擎镜像：`PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma`
- buildkit 缓存：`--mount=type=cache,target=/root/.npm` 和 `--mount=type=cache,target=/app/.next/cache`
- standalone 输出：镜像体积约 466MB

**pipeline-deploy.yml**：
- 阶段一：`build@docker` 构建镜像并推送到 TCR
- 阶段二：`shell@agent` 在服务器上执行部署脚本
- 环境变量：`TCR_USERNAME`、`TCR_PASSWORD`（在 `variables.global` 中声明）

**服务器 docker-compose.yml**：
- web 镜像：`ccr.ccs.tencentyun.com/lqzzql/web:latest`
- 数据持久化：`./data/postgres/` 和 `./data/uploads/`

### 5.4 部署脚本

```bash
cd /home/ubuntu/个人网站
docker login ccr.ccs.tencentyun.com -u ${TCR_USERNAME} -p ${TCR_PASSWORD}
docker compose pull web
docker compose up -d web
docker image prune -f || true
```

`|| true` 是因为两次 prune 并发时会报 "a prune operation is already running"，不影响部署但会导致 Gitee Go 误报失败。

---

## 六、功能完善（第二轮对话）

CI/CD 打通后，继续完善了网站功能。

### 6.1 博客 404 问题

**现象**：创建博客后点击查看，显示 404。

**根因**：`generateSlug` 允许中文进入 slug，URL 编码后无法匹配数据库。

**修复**：改为纯时间戳 slug（`Date.now().toString(36)`），简单可靠。

### 6.2 Settings 死字段激活

**问题**：Settings 里的"姓名"和"邮箱"字段在网站上没有对应显示位置。

**修复**：
- `owner_name`：显示在页脚版权信息（`© 2026 xxx. All rights reserved.`）和首页左上角 Header
- `email`：合并到关于页联系方式，删除冗余的 `about_email` 字段
- 新增公开 API：`/api/settings?keys=owner_name,email`（带白名单）

### 6.3 关于页内容重复

**问题**："关于"和"我做什么"两个区域显示同一段文字。

**修复**：新增 `about_whatido` 字段，"关于"用 `about_intro`，"我做什么"用 `about_whatido`（有 fallback）。

### 6.4 Session 登录体验优化

**问题**：点"退出"后 session 被销毁，再进后台必须重新输密码。

**修复**：
- "退出后台"：只跳转回首页，不销毁 session
- "注销登录"：真正销毁 session（需确认对话框）
- Session 有效期：24 小时 → 30 天
- 两个按钮布局：退出后台紧跟菜单，注销登录固定在侧边栏最底部

### 6.5 HTTPS 和 Cookie

**问题**：通过 IP 地址（HTTP）访问时，secure cookie 不发送，每次都要重新登录。

**修复**：
- Nginx 配置 HTTP → HTTPS 自动跳转
- 为 IP 地址生成自签证书（浏览器提示不安全，点"继续"即可）
- 域名 `liaoqizai.site` 使用正式 SSL 证书（备案成功后可用）

### 6.6 分类管理重构

**问题**：
1. Settings 里的"博客分区"和"Todo 分区"管理与 Blog/Todo 页面功能重复
2. Blog 管理页缺少内嵌分类管理（Todo 有，Blog 没有）

**修复**：
- Settings 页面移除分类管理，只保留个人信息和修改密码
- Blog 管理页新增左侧分类面板（`BlogGroupManager`），支持创建、重命名、删除分类
- 和 Todo 管理页体验一致

### 6.7 数据库清理

删除了所有测试数据（Post、Project、Todo、Category、Setting），只保留 User 表的 admin 账号。

---

## 七、安全加固

### 7.1 SSH 安全

- **密码登录**：已禁用（`PasswordAuthentication no`）
- **Root 登录**：已禁用（`PermitRootLogin no`）
- **密钥登录**：仅 3 个授权密钥（你的电脑、GitHub Actions 专用、1 个其他）

### 7.2 GitHub Actions 专用密钥

生成了 ed25519 密钥对：
- 公钥添加到服务器 `~/.ssh/authorized_keys`（注释 `github-actions-deploy`）
- 私钥只存在 GitHub Secrets 中，服务器上已删除

### 7.3 日常运维方式

| 方式 | 用途 |
|------|------|
| `git push origin main` | 日常部署（Gitee Go 自动触发） |
| GitHub Actions 手动触发 | 备用部署（需配置 6 个 Secrets） |
| 腾讯云 VNC | 紧急运维 |

### 7.4 敏感信息

- TCR 凭证通过 Gitee Go 环境变量管理，不在代码仓库中明文存储
- `.env` 文件在 `.gitignore` 中，不会提交到仓库
- 服务器上的 `.env` 通过 `cat << 'EOF'` 方式创建

---

## 八、当前状态总结

### 已完成

| 功能 | 状态 |
|------|------|
| QZ Site 网站开发 | ✅ 完成 |
| 博客系统（Tiptap + 分类管理） | ✅ 完成 |
| Todo 管理（分类管理） | ✅ 完成 |
| 深色/浅色模式 | ✅ 完成 |
| 数据库持久化 + 自动备份 | ✅ 完成 |
| CI/CD 自动部署（Gitee Go + TCR） | ✅ 完成 |
| HTTPS（自签 + 域名证书） | ✅ 完成 |
| Session 30天免登录 | ✅ 完成 |
| SSH 安全加固 | ✅ 完成 |
| GitHub Actions 备用部署 | ✅ yml 就绪（需配置 Secrets） |

### 待完成

| 事项 | 说明 |
|------|------|
| 域名备案 | 备案成功后 `liaoqizai.site` 可正式使用 |
| SSL 证书续期 | 到期前在腾讯云控制台续期，替换 `nginx/certs/` 文件 |
| 数据库备份清理 | `~/backups/` 定期清理旧备份（保留最近 7 天） |
| 网站监控 | 建议配置 Uptime Robot 免费监控 |
| TCR 镜像清理 | 定期在 ACR 控制台清理旧标签 |
| GitHub Actions Secrets | 需配置 6 个：TCR_USERNAME、TCR_PASSWORD、SERVER_HOST、SERVER_USER、SERVER_SSH_KEY、SERVER_APP_DIR |

---

## 九、技术要点备忘

- **Prisma 7** 生成路径在 `lib/generated/prisma/`，不是 `node_modules/.prisma/`
- **Next.js 16** 废弃 `middleware.ts`，改用 `proxy.ts`
- **Next.js standalone** 输出在 `.next/standalone/`，已包含运行时最小依赖
- **NEXT_PHASE** 环境变量用于区分构建时和运行时
- **buildkit 缓存**：`--mount=type=cache` 挂载 npm 和 .next 缓存目录，第二次构建起显著加速
- **npm 镜像源**：`--registry=https://registry.npmmirror.com`（淘宝镜像）
- **Prisma 引擎镜像**：`PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma`
- **ACR 内网**：基础镜像 `ccr.ccs.tencentyun.com/lqzzql/node:22-alpine`，3.5 秒拉取
- **Gitee Go**：`shell@agent` 不下载构建产物，`deploy@agent` 会强制下载（不适合 Docker 部署）
- **Session**：iron-session 加密 cookie，有效期 30 天，secure 标志根据 SITE_URL 自动判断
- **数据持久化**：postgres 数据在 `./data/postgres/`，上传文件在 `./data/uploads/`
- **服务器 docker-compose.yml**：web 镜像从 TCR 拉取（`ccr.ccs.tencentyun.com/lqzzql/web:latest`）
