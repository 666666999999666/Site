import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const schema = readFileSync("prisma/schema.prisma", "utf8")
const authConfig = readFileSync("lib/auth/better-auth.ts", "utf8")
const migration = readFileSync(
  "prisma/migrations/20260825010000_better_auth_1_7/migration.sql",
  "utf8"
)

test("security-sensitive framework and auth dependencies are exact versions", () => {
  assert.equal(packageJson.dependencies.next, "16.3.2")
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.3.2")
  assert.equal(packageJson.dependencies["better-auth"], "1.7.1")
  assert.equal(packageJson.dependencies["@better-auth/oauth-provider"], "1.7.1")
  assert.equal(packageJson.dependencies.zod, "4.4.3")
})

test("the Better Auth 1.7 schema additions are explicit and rollback-compatible", () => {
  for (const fieldOrModel of [
    "alg        String?",
    "issuer                String",
    "clientDiscoveryId",
    "clientCredentialsScopes",
    "dpopBoundAccessTokens",
    "authorizationCodeId",
    "rotationReplayResponse",
    "model OauthResource",
    "model OauthClientResource",
    "model OauthClientAssertion",
  ]) {
    assert.ok(schema.includes(fieldOrModel), `missing schema addition: ${fieldOrModel}`)
  }

  assert.match(schema, /public Boolean\s+@default\(true\)/)
  assert.match(schema, /type\s+String\?/)
  assert.doesNotMatch(migration, /DROP\s+(?:COLUMN|TABLE)/i)
})

test("the upgrade invalidates old OAuth credentials without deleting clients or sessions", () => {
  assert.match(migration, /UPDATE "OauthRefreshToken"[\s\S]*?SET "revoked"/)
  assert.match(migration, /UPDATE "OauthAccessToken"[\s\S]*?SET "revoked"/)
  assert.match(migration, /Account_issuer_accountId_key/)
  assert.match(migration, /DELETE FROM "Verification"[\s\S]*?authorization_code/)
  assert.match(migration, /DELETE FROM "Jwks"/)
  assert.doesNotMatch(migration, /DELETE FROM "OauthClient"/)
  assert.doesNotMatch(migration, /DELETE FROM "Session"/)
})

test("the MCP resource server uses the supported bearer-token verifier", () => {
  const authContext = readFileSync("lib/mcp/auth-context.ts", "utf8")
  assert.match(authContext, /import \{ verifyBearerToken \} from "better-auth\/oauth2"/)
  assert.doesNotMatch(authContext, /verifyAccessToken/)
})

test("the MCP resource policy preserves offline access for refresh-token rotation", () => {
  assert.match(authConfig, /allowedScopes: \[\.\.\.OAUTH_SCOPES\]/)
  assert.match(authConfig, /refreshTokenReuseInterval: 0/)
  assert.doesNotMatch(authConfig, /OAUTH_SCOPES\.filter\([^\n]*offline_access/)
})
