-- Private staging metadata for local stdio clients that target the production blog.
CREATE TABLE "McpImportBundle" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "uploadTokenHash" TEXT NOT NULL,
    "approvalId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "cleanedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpImportBundle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpImportBundle_approvalId_key" ON "McpImportBundle"("approvalId");
CREATE INDEX "McpImportBundle_credentialId_createdAt_idx" ON "McpImportBundle"("credentialId", "createdAt");
CREATE INDEX "McpImportBundle_expiresAt_cleanedAt_idx" ON "McpImportBundle"("expiresAt", "cleanedAt");

ALTER TABLE "McpImportBundle"
ADD CONSTRAINT "McpImportBundle_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "McpCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpImportBundle"
ADD CONSTRAINT "McpImportBundle_approvalId_fkey"
FOREIGN KEY ("approvalId") REFERENCES "McpApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
