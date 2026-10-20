import { requireDisposableTestDatabaseUrl } from "./disposable-test-database"

export function requireBlogSeriesTestDatabaseUrl(value: string | undefined) {
  return requireDisposableTestDatabaseUrl(value, {
    variable: "BLOG_SERIES_TEST_DATABASE_URL",
    schemaPattern: /^blog_series_test_[a-z0-9_]+$/,
    isolationMessage: "Blog Series tests require a disposable test database and isolated blog_series_test_* schema",
  })
}
