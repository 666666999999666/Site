-- #8/#12: 密码版本字段，修改密码时递增使旧 session 失效。
-- DEFAULT 1 向前兼容：旧镜像的 Prisma Client 不查询此字段，回滚不崩溃。
ALTER TABLE "User" ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 1;
