import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

/** Daily's destructive browser workflow must never inherit an ambient application URL. */
export function requireDailyTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("DAILY_TEST_DATABASE_URL is required")
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("DAILY_TEST_DATABASE_URL must be a valid PostgreSQL URL")
  }
  const database = decodeURIComponent(parsed.pathname.slice(1))
  const schema = parsed.searchParams.get("schema") ?? ""
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^[a-z0-9_]*test[a-z0-9_]*$/.test(database) ||
    !/^daily_test_[a-z0-9_]{8,}$/.test(schema) ||
    /prod|liaoqizai/i.test(`${database}/${schema}`)) {
    throw new Error("Daily browser tests require a local disposable test database, isolated daily_test_* schema and no connection overrides")
  }
  assertSafeTestDatabaseUrlParameters(parsed, {
    message: "Daily browser tests require a local disposable test database, isolated daily_test_* schema and no connection overrides",
  })
  return { url: value, schema }
}

export function requireEmptyDailyTestAccounts(count: number) {
  if (count !== 0) throw new Error("Daily browser tests require an empty account set; use a freshly migrated disposable schema")
}

export function requireDailyFixtureLogin(
  login: { userId?: string; username?: string },
  fixture: { id: string; username: string }
) {
  if (login.userId !== fixture.id || login.username !== fixture.username) {
    throw new Error("Daily browser test login did not resolve to its own fixture account")
  }
}
