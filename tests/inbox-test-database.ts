import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

export function requireInboxTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is required")
  const url = new URL(value)
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""))
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"])
  if (!localHosts.has(url.hostname) || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName)) {
    throw new Error("Inbox integration tests only run against a local database whose name contains 'test'")
  }
  assertSafeTestDatabaseUrlParameters(url)
  return value
}
