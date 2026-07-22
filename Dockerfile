FROM docker.xuanyuan.me/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit --no-package-lock

FROM docker.xuanyuan.me/library/node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_PHASE="phase-production-build"
RUN npx prisma generate
RUN npm run build

# 在独立目录安装 prisma CLI（完整依赖树，不影响 standalone）
FROM docker.xuanyuan.me/library/node:22-alpine AS prisma-cli
WORKDIR /prisma
RUN npm init -y && npm install --no-fund --no-audit prisma@7 dotenv

FROM docker.xuanyuan.me/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone 输出已包含运行时所需的最小依赖（含 pg、@prisma/client 等）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# standalone 可能遗漏的运行时依赖（iron-session、bcryptjs 等 API route 依赖）
RUN cd /app && npm install --no-fund --no-audit iron-session bcryptjs

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

# 启动时先同步数据库再启动服务
# NODE_PATH 让 prisma CLI 能 resolve @prisma/* 等包
# db push: 根据 schema 同步表结构，加字段不丢数据，删字段会丢（我们不会删）
CMD ["sh", "-c", "cd /app && NODE_PATH=/prisma/node_modules node /prisma/node_modules/prisma/build/index.js db push && node server.js"]
