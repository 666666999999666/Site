import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

type DisposableTestDatabasePolicy = {
  variable: string
  schemaPattern: RegExp
  isolationMessage: string
}

/** Parse test-only destinations before any database client or connection is created. */
export function requireDisposableTestDatabaseUrl(
  value: string | undefined,
  policy: DisposableTestDatabasePolicy
) {
  if (!value) throw new Error(`${policy.variable} is required`)

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${policy.variable} must be a valid PostgreSQL URL`)
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${policy.variable} must use postgres:// or postgresql://`)
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase()
  const schema = parsed.searchParams.get("schema") ?? ""
  const hostname = parsed.hostname.toLowerCase()
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)
  const explicitTestHost = /(^|[.-])test([.-]|$)/.test(hostname)
  const productionLooking = /liaoqizai|production|prod/i.test(`${hostname}/${databaseName}/${schema}`)

  if (!databaseName.includes("test") || !policy.schemaPattern.test(schema)) {
    throw new Error(policy.isolationMessage)
  }
  if (productionLooking || (!localHost && !explicitTestHost)) {
    throw new Error("Refusing to use a non-test or production-looking database host")
  }
  assertSafeTestDatabaseUrlParameters(parsed)

  return { url: value, parsed, databaseName, schema }
}
