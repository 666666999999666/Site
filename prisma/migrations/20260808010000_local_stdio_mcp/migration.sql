-- CreateEnum
CREATE TYPE "McpApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Post"
ADD COLUMN "coverImage" TEXT,
ADD COLUMN "draftMetadata" JSONB;

-- CreateTable
CREATE TABLE "McpCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpApproval" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "requiredScope" TEXT NOT NULL,
    "status" "McpApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "payload" JSONB NOT NULL,
    "parameterSummary" JSONB NOT NULL,
    "resultSummary" JSONB,
    "executionError" TEXT,
    "processingAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAuditLog" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT,
    "toolName" TEXT NOT NULL,
    "parameterSummary" JSONB NOT NULL,
    "resultSummary" JSONB,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpRateLimit" (
    "credentialId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "McpRateLimit_pkey" PRIMARY KEY ("credentialId", "toolName", "windowStart")
);

-- CreateTable
CREATE TABLE "McpExecution" (
    "approvalId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "resultSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpExecution_pkey" PRIMARY KEY ("approvalId")
);

-- CreateIndex
CREATE INDEX "McpCredential_revokedAt_idx" ON "McpCredential"("revokedAt");

-- CreateIndex
CREATE INDEX "McpApproval_status_createdAt_idx" ON "McpApproval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "McpApproval_credentialId_createdAt_idx" ON "McpApproval"("credentialId", "createdAt");

-- CreateIndex
CREATE INDEX "McpAuditLog_credentialId_createdAt_idx" ON "McpAuditLog"("credentialId", "createdAt");

-- CreateIndex
CREATE INDEX "McpAuditLog_toolName_createdAt_idx" ON "McpAuditLog"("toolName", "createdAt");

-- CreateIndex
CREATE INDEX "McpRateLimit_windowStart_idx" ON "McpRateLimit"("windowStart");

-- AddForeignKey
ALTER TABLE "McpApproval" ADD CONSTRAINT "McpApproval_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "McpCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAuditLog" ADD CONSTRAINT "McpAuditLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "McpCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpRateLimit" ADD CONSTRAINT "McpRateLimit_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "McpCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpExecution" ADD CONSTRAINT "McpExecution_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "McpApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
