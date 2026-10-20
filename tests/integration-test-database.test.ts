import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { requireDailyIntegrationTestDatabaseUrl } from "./daily-integration-test-database"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"
import { requireMcpOAuthTestDatabaseUrl } from "./mcp-oauth-test-database"

test("Daily integration guard preserves its database-name policy and exact errors", () => {
  for (const value of [
    "postgresql://fixture@localhost/site_test",
    "postgres://fixture@127.0.0.1/My_TEST?schema=fixture",
    // Query hardening does not add a host allowlist or rewrite this legacy policy.
    "postgresql://fixture@test.example.com/contest",
  ]) assert.equal(requireDailyIntegrationTestDatabaseUrl(value), value)

  for (const value of [undefined, ""]) {
    assert.throws(() => requireDailyIntegrationTestDatabaseUrl(value), { message: "DATABASE_URL is required" })
  }
  assert.throws(() => requireDailyIntegrationTestDatabaseUrl("not-a-url"), TypeError)
  for (const database of ["application", "site_%74est"]) {
    assert.throws(
      () => requireDailyIntegrationTestDatabaseUrl(`postgresql://localhost/${database}`),
      { message: "Daily integration tests require a disposable database whose name contains 'test'" }
    )
  }
})

test("Inbox integration guard preserves its local-host and delimited test-name policy", () => {
  for (const value of [
    "postgresql://fixture@localhost/site_test",
    "postgres://fixture@127.0.0.1/TEST-site?schema=fixture",
    "postgresql://fixture@localhost/site_%74est",
  ]) assert.equal(requireInboxTestDatabaseUrl(value), value)

  for (const value of [undefined, ""]) {
    assert.throws(() => requireInboxTestDatabaseUrl(value), { message: "DATABASE_URL is required" })
  }
  assert.throws(() => requireInboxTestDatabaseUrl("not-a-url"), TypeError)
  assert.throws(() => requireInboxTestDatabaseUrl("postgresql://localhost/%ZZtest"), URIError)
  for (const value of [
    "postgresql://test.example.com/site_test", "postgresql://localhost/contest",
    "postgresql://localhost/application", "postgresql://[::1]/site_test",
  ]) {
    assert.throws(() => requireInboxTestDatabaseUrl(value), {
      message: "Inbox integration tests only run against a local database whose name contains 'test'",
    })
  }
})

test("OAuth integration guard preserves its existing local destination assertions", () => {
  for (const value of [
    "postgresql://fixture@localhost/site_test",
    "postgres://fixture@127.0.0.1/TEST-site",
    "postgresql://fixture@localhost/contest",
  ]) assert.equal(requireMcpOAuthTestDatabaseUrl(value), value)

  for (const value of [undefined, ""]) {
    assert.throws(() => requireMcpOAuthTestDatabaseUrl(value), {
      name: "AssertionError",
      message: "MCP_OAUTH_TEST_DATABASE_URL is required",
    })
  }
  assert.throws(() => requireMcpOAuthTestDatabaseUrl("not-a-url"), TypeError)
  for (const database of ["application", "site_%74est"]) {
    assert.throws(
      () => requireMcpOAuthTestDatabaseUrl(`postgresql://localhost/${database}`),
      (error) => error instanceof assert.AssertionError &&
        error.message.startsWith("OAuth integration database name must contain 'test'")
    )
  }
  for (const host of ["test.example.com", "[::1]"]) {
    assert.throws(() => requireMcpOAuthTestDatabaseUrl(`postgresql://${host}/site_test`), {
      name: "AssertionError",
      message: "OAuth integration database must be local",
    })
  }
})

test("integration entrypoints validate before importing database-backed code or connecting", async () => {
  const [daily, inbox, oauth] = await Promise.all([
    readFile(new URL("./daily-integration.ts", import.meta.url), "utf8"),
    readFile(new URL("./inbox-integration.ts", import.meta.url), "utf8"),
    readFile(new URL("./mcp-oauth-integration.ts", import.meta.url), "utf8"),
  ])
  assert.match(daily, /requireDailyIntegrationTestDatabaseUrl\(process\.env\.DATABASE_URL\)[\s\S]*await import\("\.\.\/lib\/daily"\)/)
  assert.match(inbox, /requireInboxTestDatabaseUrl\(process\.env\.DATABASE_URL\)\s+const \{ prisma, disconnectDatabase \} = await import\("\.\.\/lib\/db"\)/)
  assert.doesNotMatch(inbox, /^import .* from ["']\.\.\/lib\/(?:db|inbox\/service)["']/m)
  assert.match(oauth, /requireMcpOAuthTestDatabaseUrl\(process\.env\.MCP_OAUTH_TEST_DATABASE_URL\)\s+const pg = new PgClient[\s\S]*await pg\.connect\(\)/)
  assert.match(oauth, /assert\.equal\(migrated\.rows\[0\]\.accountPassword, oldHash\)[\s\S]*directories\.filter\(\(name\) => name > BETTER_AUTH_1_7_MIGRATION\)[\s\S]*await client\.query\(sql\)/)
})
