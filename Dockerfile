ARG NODE_IMAGE=ccr.ccs.tencentyun.com/lqzzql/node:22-alpine@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN npm install --global npm@11.12.1 --registry=https://registry.npmmirror.com --no-fund --no-audit
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --registry=https://registry.npmmirror.com --no-fund --no-audit --legacy-peer-deps

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
# Task 23: 构建时注入站点域名（NEXT_PUBLIC_* 会被内联进产物，运行时设置无效）。
# 默认值为生产域名，确保即使 CI 不传 buildArgs 也不会泄露 localhost。
ARG NEXT_PUBLIC_SITE_URL=https://liaoqizai.site
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/source-fingerprint.mjs /app > /tmp/source-fingerprint
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_PHASE="phase-production-build"
RUN npx prisma validate
RUN npx prisma generate
RUN npm run lint
RUN npm test
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Migration and controlled maintenance scripts use a pinned toolchain.
FROM ${NODE_IMAGE} AS prisma-cli
WORKDIR /prisma
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN --mount=type=cache,target=/root/.npm \
    npm init -y && npm install --registry=https://registry.npmmirror.com --no-fund --no-audit \
    prisma@7.9.1 dotenv@17.4.2 tsx@4.23.1 pg@8.22.0 mdast-util-from-markdown@2.0.3

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /tmp/source-fingerprint ./.source-fingerprint

# Images bypass the Next optimizer, so the runtime omits libvips/sharp.
RUN rm -rf /app/node_modules/sharp /app/node_modules/@img

COPY --from=builder /app/prisma/ ./prisma/
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib/generated/ ./lib/generated/

COPY --from=prisma-cli /prisma/node_modules/ /prisma/node_modules/
COPY --from=builder /app/scripts/ /prisma/tools/scripts/
COPY --from=builder /app/lib/content.ts /prisma/tools/lib/content.ts

RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

USER node
CMD ["sh", "-c", "cd /app && export NODE_PATH=/prisma/node_modules && P=/prisma/node_modules/prisma/build/index.js && node $P migrate deploy && node server.js"]
