-- Better Auth database sessions and OAuth 2.1 provider storage.
CREATE TYPE "McpCredentialKind" AS ENUM ('STATIC', 'OAUTH');
CREATE TYPE "McpAuditStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILURE', 'INTERRUPTED');

ALTER TABLE "User"
ADD COLUMN "name" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "image" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "User"
SET
  "name" = "username",
  "email" = "username" || '@liaoqizai.site',
  "updatedAt" = CURRENT_TIMESTAMP,
  "passwordVersion" = "passwordVersion" + 1;

ALTER TABLE "User"
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

INSERT INTO "Account" (
  "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
)
SELECT
  'credential:' || "id", "id", 'credential', "id", "passwordHash", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("providerId", "accountId") DO NOTHING;

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

CREATE TABLE "Jwks" (
  "id" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "Jwks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthClient" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecret" TEXT,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "skipConsent" BOOLEAN,
  "enableEndSession" BOOLEAN,
  "subjectType" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "name" TEXT,
  "uri" TEXT,
  "icon" TEXT,
  "contacts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tos" TEXT,
  "policy" TEXT,
  "softwareId" TEXT,
  "softwareVersion" TEXT,
  "softwareStatement" TEXT,
  "redirectUris" TEXT[] NOT NULL,
  "postLogoutRedirectUris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenEndpointAuthMethod" TEXT,
  "grantTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "responseTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "public" BOOLEAN NOT NULL DEFAULT true,
  "type" TEXT,
  "requirePKCE" BOOLEAN NOT NULL DEFAULT true,
  "referenceId" TEXT,
  "metadata" JSONB,
  CONSTRAINT "OauthClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OauthClient_clientId_key" ON "OauthClient"("clientId");
CREATE INDEX "OauthClient_userId_idx" ON "OauthClient"("userId");
CREATE INDEX "OauthClient_createdAt_idx" ON "OauthClient"("createdAt");

CREATE TABLE "OauthRefreshToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT,
  "userId" TEXT NOT NULL,
  "referenceId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked" TIMESTAMP(3),
  "authTime" TIMESTAMP(3),
  "scopes" TEXT[] NOT NULL,
  CONSTRAINT "OauthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OauthRefreshToken_token_key" ON "OauthRefreshToken"("token");
CREATE INDEX "OauthRefreshToken_clientId_idx" ON "OauthRefreshToken"("clientId");
CREATE INDEX "OauthRefreshToken_sessionId_idx" ON "OauthRefreshToken"("sessionId");
CREATE INDEX "OauthRefreshToken_userId_idx" ON "OauthRefreshToken"("userId");
CREATE INDEX "OauthRefreshToken_expiresAt_idx" ON "OauthRefreshToken"("expiresAt");

CREATE TABLE "OauthAccessToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT,
  "userId" TEXT,
  "referenceId" TEXT,
  "refreshId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scopes" TEXT[] NOT NULL,
  CONSTRAINT "OauthAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OauthAccessToken_token_key" ON "OauthAccessToken"("token");
CREATE INDEX "OauthAccessToken_clientId_idx" ON "OauthAccessToken"("clientId");
CREATE INDEX "OauthAccessToken_sessionId_idx" ON "OauthAccessToken"("sessionId");
CREATE INDEX "OauthAccessToken_userId_idx" ON "OauthAccessToken"("userId");
CREATE INDEX "OauthAccessToken_refreshId_idx" ON "OauthAccessToken"("refreshId");
CREATE INDEX "OauthAccessToken_expiresAt_idx" ON "OauthAccessToken"("expiresAt");

CREATE TABLE "OauthConsent" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT,
  "referenceId" TEXT,
  "scopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OauthConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OauthConsent_clientId_idx" ON "OauthConsent"("clientId");
CREATE INDEX "OauthConsent_userId_idx" ON "OauthConsent"("userId");
CREATE UNIQUE INDEX "OauthConsent_clientId_userId_key" ON "OauthConsent"("clientId", "userId");

ALTER TABLE "McpCredential"
ADD COLUMN "kind" "McpCredentialKind" NOT NULL DEFAULT 'STATIC',
ADD COLUMN "oauthClientId" TEXT,
ADD COLUMN "oauthSubject" TEXT,
ALTER COLUMN "secretHash" DROP NOT NULL;

CREATE UNIQUE INDEX "McpCredential_oauthClientId_key" ON "McpCredential"("oauthClientId");
CREATE INDEX "McpCredential_kind_revokedAt_idx" ON "McpCredential"("kind", "revokedAt");

ALTER TABLE "McpAuditLog"
ADD COLUMN "status" "McpAuditStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "McpAuditLog"
SET
  "status" = CASE WHEN "success" THEN 'SUCCESS'::"McpAuditStatus" ELSE 'FAILURE'::"McpAuditStatus" END,
  "completedAt" = "createdAt";

CREATE INDEX "McpAuditLog_status_createdAt_idx" ON "McpAuditLog"("status", "createdAt");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account"
ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OauthClient"
ADD CONSTRAINT "OauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OauthRefreshToken"
ADD CONSTRAINT "OauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "OauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OauthAccessToken"
ADD CONSTRAINT "OauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "OauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "OauthRefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OauthConsent"
ADD CONSTRAINT "OauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
