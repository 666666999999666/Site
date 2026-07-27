FROM ccr.ccs.tencentyun.com/lqzzql/node:22-alpine AS deps
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --registry=https://registry.npmmirror.com --no-fund --no-audit --legacy-peer-deps

FROM ccr.ccs.tencentyun.com/lqzzql/node:22-alpine AS builder
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_PHASE="phase-production-build"
RUN npx prisma generate
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# 在独立目录安装 prisma CLI（完整依赖树，不影响 standalone）
FROM ccr.ccs.tencentyun.com/lqzzql/node:22-alpine AS prisma-cli
WORKDIR /prisma
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN --mount=type=cache,target=/root/.npm \
    npm init -y && npm install --registry=https://registry.npmmirror.com --no-fund --no-audit prisma@7 dotenv

FROM ccr.ccs.tencentyun.com/lqzzql/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone 输出已包含运行时所需的最小依赖（含 pg、@prisma/client 等）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# standalone 可能遗漏的运行时依赖（iron-session、bcryptjs 等 API route 依赖）
# --ignore-scripts: 跳过 postinstall，避免 @prisma/engines 下载引擎二进制文件（runner 不需要）
RUN --mount=type=cache,target=/root/.npm \
    cd /app && npm install --registry=https://registry.npmmirror.com --no-fund --no-audit --legacy-peer-deps --ignore-scripts iron-session bcryptjs

# prisma schema + config + 生成代码
COPY --from=builder /app/prisma/ ./prisma/
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib/generated/ ./lib/generated/

# prisma CLI 放到独立目录，通过 NODE_PATH 让它能找到依赖
COPY --from=prisma-cli /prisma/node_modules/ /prisma/node_modules/

# 上传目录
RUN mkdir -p /app/public/uploads

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动时先执行已审核的 migration 再启动服务
# NODE_PATH 让 prisma CLI 能 resolve @prisma/* 等包
# 如果 migrate deploy 失败（baseline 遇到已存在的表），
# 自动 resolve baseline 让 Prisma 标记已应用，然后重试
CMD ["sh", "-c", "cd /app && export NODE_PATH=/prisma/node_modules && P=/prisma/node_modules/prisma/build/index.js && (node $P migrate deploy || (node $P migrate resolve --applied 0_init && node $P migrate deploy)) && node server.js"]
