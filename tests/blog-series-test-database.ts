const BLOG_SERIES_TEST_SCHEMA_PATTERN = /^blog_series_test_[a-z0-9_]+$/

export function requireBlogSeriesTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("BLOG_SERIES_TEST_DATABASE_URL is required")

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("BLOG_SERIES_TEST_DATABASE_URL must be a valid PostgreSQL URL")
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("BLOG_SERIES_TEST_DATABASE_URL must use postgres:// or postgresql://")
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase()
  const schema = parsed.searchParams.get("schema") ?? ""
  const hostname = parsed.hostname.toLowerCase()
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)
  const explicitTestHost = /(^|[.-])test([.-]|$)/.test(hostname)
  const productionLooking = /liaoqizai|production|prod/i.test(`${hostname}/${databaseName}/${schema}`)

  if (!databaseName.includes("test") || !BLOG_SERIES_TEST_SCHEMA_PATTERN.test(schema)) {
    throw new Error("Blog Series tests require a disposable test database and isolated blog_series_test_* schema")
  }
  if (productionLooking || (!localHost && !explicitTestHost)) {
    throw new Error("Refusing to use a non-test or production-looking database host")
  }

  return { url: value, parsed, databaseName, schema }
}
