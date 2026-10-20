import assert from "node:assert/strict"
import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

export function requireMcpOAuthTestDatabaseUrl(value: string | undefined): string {
  assert.ok(value, "MCP_OAUTH_TEST_DATABASE_URL is required")
  const parsed = new URL(value)
  const database = parsed.pathname.replace(/^\//, "").toLowerCase()
  assert.match(database, /test/, "OAuth integration database name must contain 'test'")
  assert.ok(
    ["127.0.0.1", "localhost"].includes(parsed.hostname),
    "OAuth integration database must be local"
  )
  // This workflow resets public directly; an alternative schema is not isolated.
  assertSafeTestDatabaseUrlParameters(parsed, { allowSchema: false })
  return value
}
