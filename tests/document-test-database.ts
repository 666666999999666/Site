export function requireDocumentTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("DOCUMENT_TEST_DATABASE_URL is required")
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !decodeURIComponent(url.pathname).includes("test") ||
    !/^document_test_[a-z0-9_]+$/.test(url.searchParams.get("schema") ?? "") ||
    /prod|liaoqizai/i.test(url.pathname + url.searchParams.get("schema"))) {
    throw new Error("Document tests require a local disposable test database and document_test_* schema")
  }
  return value
}
