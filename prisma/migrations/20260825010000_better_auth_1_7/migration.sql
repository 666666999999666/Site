-- Better Auth 1.7 adds key metadata and expands the OAuth provider schema.
-- This migration is additive: the legacy OauthClient public/type columns stay
-- in place so the previous immutable application image can still roll back.

ALTER TABLE "Jwks"
  ADD COLUMN "alg" TEXT,
  ADD COLUMN "crv" TEXT;

ALTER TABLE "Account"
  ADD COLUMN "issuer" TEXT NOT NULL DEFAULT 'local:credential';

UPDATE "Account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END;

CREATE UNIQUE INDEX "Account_issuer_accountId_key"
  ON "Account"("issuer", "accountId");

ALTER TABLE "OauthClient"
  ADD COLUMN "applicationType" TEXT,
  ADD COLUMN "backchannelLogoutSessionRequired" BOOLEAN,
  ADD COLUMN "backchannelLogoutUri" TEXT,
  ADD COLUMN "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "clientDiscoveryId" TEXT,
  ADD COLUMN "dpopBoundAccessTokens" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "jwks" TEXT,
  ADD COLUMN "jwksUri" TEXT;

ALTER TABLE "OauthRefreshToken"
  ADD COLUMN "authorizationCodeId" TEXT,
  ADD COLUMN "confirmation" JSONB,
  ADD COLUMN "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "rotatedAt" TIMESTAMP(3),
  ADD COLUMN "rotationReplayExpiresAt" TIMESTAMP(3),
  ADD COLUMN "rotationReplayResponse" TEXT;

ALTER TABLE "OauthAccessToken"
  ADD COLUMN "authorizationCodeId" TEXT,
  ADD COLUMN "confirmation" JSONB,
  ADD COLUMN "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "revoked" TIMESTAMP(3);

ALTER TABLE "OauthConsent"
  ADD COLUMN "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "resources" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "OauthResource" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accessTokenTtl" INTEGER,
  "refreshTokenTtl" INTEGER,
  "signingAlgorithm" TEXT,
  "signingKeyId" TEXT,
  "allowedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "customClaims" JSONB,
  "dpopBoundAccessTokensRequired" BOOLEAN NOT NULL DEFAULT false,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,

  CONSTRAINT "OauthResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthClientResource" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OauthClientResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OauthClientAssertion" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OauthClientAssertion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OauthResource_identifier_key"
  ON "OauthResource"("identifier");
CREATE INDEX "OauthClientResource_clientId_idx"
  ON "OauthClientResource"("clientId");
CREATE INDEX "OauthClientResource_resourceId_idx"
  ON "OauthClientResource"("resourceId");
CREATE UNIQUE INDEX "OauthClientResource_clientId_resourceId_key"
  ON "OauthClientResource"("clientId", "resourceId");
CREATE INDEX "OauthClientAssertion_expiresAt_idx"
  ON "OauthClientAssertion"("expiresAt");
CREATE INDEX "OauthAccessToken_authorizationCodeId_idx"
  ON "OauthAccessToken"("authorizationCodeId");
CREATE INDEX "OauthRefreshToken_authorizationCodeId_idx"
  ON "OauthRefreshToken"("authorizationCodeId");

ALTER TABLE "OauthClientResource"
  ADD CONSTRAINT "OauthClientResource_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OauthClientResource"
  ADD CONSTRAINT "OauthClientResource_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "OauthResource"("identifier")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Invalidate credentials and one-time codes created by the vulnerable release
-- while preserving OAuth clients, consents, sessions, and audit evidence.
UPDATE "OauthRefreshToken"
SET "revoked" = CURRENT_TIMESTAMP
WHERE "revoked" IS NULL;

UPDATE "OauthAccessToken"
SET "revoked" = CURRENT_TIMESTAMP
WHERE "revoked" IS NULL;

DELETE FROM "Verification"
WHERE "value" LIKE '%"type":"authorization_code"%';

-- JWT access tokens are stateless. Rotating the JWK set is what makes tokens
-- signed by the previous release fail local verification immediately.
DELETE FROM "Jwks";
