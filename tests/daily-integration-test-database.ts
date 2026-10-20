import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

export function requireDailyIntegrationTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is required")
  const parsed = new URL(value)
  const databaseName = parsed.pathname.slice(1).toLowerCase()
  if (!databaseName.includes("test")) {
    throw new Error("Daily integration tests require a disposable database whose name contains 'test'")
  }
  assertSafeTestDatabaseUrlParameters(parsed)
  return value
}
