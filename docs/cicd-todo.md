# CI/CD 待办事项

## 当前状态

网站已成功部署在 http://203.195.208.172，但 CI/CD 自动部署链路尚未打通。

### 核心问题

服务器带宽仅 4Mbps，传输大型 Docker 镜像（1.47GB）非常慢：
- ghcr.io 拉取：15+ 分钟，超时失败
- SSH 管道传输：同样受 4Mbps 限制，30+ 分钟仍未完成
- 服务器上 docker build：2核4G 构建会卡死 SSH 服务 5-8 分钟

### 解决方向：优化镜像体积

已验证的关键优化：**将 Docker 镜像从 1.47GB 缩小到 466MB**（减少 68%）

修改了 Dockerfile，核心变化：
1. 不再复制完整 `node_modules`（约 800MB）到 runner 阶段
2. 使用 Next.js standalone 输出（已包含运行时最小依赖）
3. 单独安装 prisma CLI（db push 需要）到 `/prisma/node_modules/`，避免和 standalone 的 node_modules 冲突

**当前 Dockerfile 修改尚未验证通过**——`npx --yes /prisma/node_modules/prisma db push` 命令是否能正确运行还需要测试。

## 待完成的具体步骤

### 步骤 1：验证并修复 Dockerfile

当前 Dockerfile（已修改但未提交）：

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_PHASE="phase-production-build"
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS prisma-cli
WORKDIR /prisma
RUN npm init -y && npm install prisma@7

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma/ ./prisma/
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib/generated/ ./lib/generated/

COPY --from=prisma-cli /prisma/node_modules/ /prisma/node_modules/

RUN mkdir -p /app/public/uploads

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "cd /app && npx --yes /prisma/node_modules/prisma db push && node server.js"]
```

**需要验证的问题**：
- `npx --yes /prisma/node_modules/prisma db push` 能否正确执行？
- 如果不行，可能需要直接调用：`node /prisma/node_modules/prisma/build/index.js db push`
- 或者用 `PATH` 方式：`PATH="/prisma/node_modules/.bin:$PATH" prisma db push`

**验证方法**：
1. 本地构建：`docker build -t qzsite:test .`
2. 本地运行测试（需要本地 PostgreSQL 或直接部署到服务器）
3. 或直接部署到服务器：`scp qzsite.tar ubuntu@203.195.208.172:/tmp/` → `docker load` → `docker compose up -d web`
4. 检查日志：`docker compose logs web`

### 步骤 2：确认镜像大小

优化目标：镜像 gzip 压缩后 < 200MB（4Mbps 约 5-6 分钟传完）

验证：
```bash
docker save qzsite:latest | gzip > /tmp/test.tar.gz
ls -lh /tmp/test.tar.gz
```

### 步骤 3：更新 deploy.yml

当前 `.github/workflows/deploy.yml` 已改为 SSH 管道传输方案：

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: qzsite:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Save and transfer image to server
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SERVER_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.SERVER_HOST }} >> ~/.ssh/known_hosts 2>/dev/null
          echo "Saving and transferring image via SSH..."
          docker save qzsite:latest | gzip | ssh -i ~/.ssh/deploy_key -o ConnectTimeout=30 -o ServerAliveInterval=60 ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_HOST }} "gunzip | docker load"

      - name: Restart services
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script_stop: true
          script: |
            cd ${{ secrets.SERVER_APP_DIR }}
            docker compose up -d web
            docker image prune -f
```

**如果镜像优化后仍然传输慢，可考虑替代方案**：
- 方案 A：GitHub Actions 构建 → 保存 tar 到 artifact → 服务器从 artifact 下载（GitHub CDN 可能比直连快）
- 方案 B：服务器上构建但用 `nohup`，避免 SSH 超时（但会卡 5-8 分钟）
- 方案 C：升级服务器带宽（付费）

### 步骤 4：更新 deploy.ps1

`deploy.ps1` 的 scp 上传到中文目录路径（`/home/ubuntu/个人网站/`）有编码问题，需要修复。

改为先上传到 `/tmp/`，然后在服务器上移动：
```powershell
scp $TAR_FILE "${SERVER}:/tmp/${TAR_FILE}"
ssh $SERVER "cd ${REMOTE_DIR} && docker load -i /tmp/${TAR_FILE} && docker compose up -d && rm /tmp/${TAR_FILE}"
```

### 步骤 5：端到端测试

1. 提交 Dockerfile 优化 + deploy.yml + deploy.ps1 修复
2. `git push origin master:main`
3. 在 GitHub Actions 页面观察：构建 → 传输 → 重启
4. 验证网站可访问：`curl.exe -s -o NUL -w "%{http_code}" http://203.195.208.172`
5. 验证数据库未重置

### 步骤 6：更新 docs/deploy.md

CI/CD 打通后，更新部署文档中的 CI/CD 部分。

## 服务器信息

- IP：203.195.208.172
- 用户：ubuntu
- 项目目录：`/home/ubuntu/个人网站/`
- docker-compose.yml：使用 `image: qzsite:latest` + `pull_policy: never`
- .env：已配置（DB_NAME, DB_USER, DB_PASSWORD, SESSION_SECRET 等）
- 数据持久化：`./data/postgres/` 和 `./data/uploads/`
- 当前运行镜像：qzsite:latest（1.47GB，旧版带完整 node_modules）

## GitHub Secrets（已配置）

- SERVER_HOST
- SERVER_USER
- SERVER_SSH_KEY
- SERVER_APP_DIR

## 关键文件路径

- `Dockerfile` - 已修改（镜像优化），未提交
- `.github/workflows/deploy.yml` - 已修改（SSH 管道方案），已提交
- `docker-compose.yml` - 已修改（image 模式），已提交
- `deploy.ps1` - 已创建，需修复中文路径问题
- `docs/deploy.md` - 已更新
