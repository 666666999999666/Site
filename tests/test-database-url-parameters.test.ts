import assert from "node:assert/strict"
import test from "node:test"
import { requireBlogSeriesTestDatabaseUrl } from "./blog-series-test-database"
import { requireDailyIntegrationTestDatabaseUrl } from "./daily-integration-test-database"
import { requireDailyTestDatabaseUrl } from "./daily-test-database"
import { requireDocumentTestDatabaseUrl } from "./document-test-database"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"
import { requireMcpOAuthTestDatabaseUrl } from "./mcp-oauth-test-database"
import { requireQuestionTestDatabaseUrl } from "./question-test-database"
import { assertSafeTestDatabaseUrlParameters } from "./test-database-url-parameters"

const base = "postgresql://fixture@127.0.0.1:55439/site_test"
const guards = [
  { name: "Question", validate: requireQuestionTestDatabaseUrl, schema: "question_test_run_1" },
  { name: "Blog Series", validate: requireBlogSeriesTestDatabaseUrl, schema: "blog_series_test_run_1" },
  { name: "Document", validate: requireDocumentTestDatabaseUrl, schema: "document_test_run_1" },
  { name: "Daily browser", validate: requireDailyTestDatabaseUrl, schema: "daily_test_run_12345678" },
  { name: "Daily integration", validate: requireDailyIntegrationTestDatabaseUrl, schema: "daily_test_run_1", optionalSchema: true },
  { name: "Inbox integration", validate: requireInboxTestDatabaseUrl, schema: "inbox_test_run_1", optionalSchema: true },
  { name: "MCP OAuth", validate: requireMcpOAuthTestDatabaseUrl, schema: undefined },
]

test("test database query allowlist accepts only zero or one decoded, case-sensitive schema key", () => {
  for (const query of ["", "?", "?schema=fixture", "?%73chema=fixture", "?sch%65ma=fixture"]) {
    assert.doesNotThrow(() => assertSafeTestDatabaseUrlParameters(new URL(base + query)))
  }
  for (const query of [
    "?schema=one&schema=two", "?schema=one&%73chema=two", "?Schema=one", "?SCHEMA=one",
    "?%2573chema=one", "?=value", "?unknown=value", "#", "#fragment",
  ]) {
    assert.throws(
      () => assertSafeTestDatabaseUrlParameters(new URL(base + query)),
      /connection overrides/,
      query
    )
  }
  assert.doesNotThrow(() => assertSafeTestDatabaseUrlParameters(new URL(base), { allowSchema: false }))
  assert.throws(
    () => assertSafeTestDatabaseUrlParameters(new URL(`${base}?schema=public`), { allowSchema: false }),
    /connection overrides/
  )
})

for (const guard of guards) {
  const valid = guard.schema ? `${base}?schema=${guard.schema}` : base
  const addQuery = (query: string) => `${valid}${guard.schema ? "&" : "?"}${query}`

  test(`${guard.name} guard rejects non-PostgreSQL protocols before connecting`, () => {
    for (const protocol of ["http:", "https:", "file:", "mysql:"]) {
      assert.throws(() => guard.validate(valid.replace("postgresql:", protocol)))
    }
  })

  test(`${guard.name} guard preserves its supported schema usage`, () => {
    assert.doesNotThrow(() => guard.validate(valid))
    if (guard.schema) {
      assert.doesNotThrow(() => guard.validate(`${base}?%73chema=${guard.schema}`))
      if (guard.optionalSchema) {
        assert.doesNotThrow(() => guard.validate(base))
      } else {
        assert.throws(() => guard.validate(base))
      }
    } else {
      // OAuth resets public explicitly, so no schema parameter is safe for this workflow.
      for (const query of ["schema=public", "schema=oauth_test_run_1", "%73chema=public", "schema="]) {
        assert.throws(() => guard.validate(addQuery(query)), /connection overrides/, query)
      }
    }
  })

  test(`${guard.name} guard rejects connection redirects and all unknown query keys`, () => {
    for (const query of [
      "host=remote.example.com", "host=localhost", "hostaddr=192.0.2.1",
      "port=5432", "database=application", "dbname=application",
      "user=another_user", "password=synthetic", "options=-csearch_path%3Dpublic",
      "options=-c%20search_path%3Dpublic", "search_path=public", "service=remote",
      "servicefile=synthetic.conf", "sslmode=disable", "sslcert=synthetic.pem",
      "sslkey=synthetic.pem", "sslrootcert=synthetic.pem", "application_name=fixture",
      "connectionTimeoutMillis=1", "unknown=value", "host", "=value",
      "Host=remote.example.com", "HOST=remote.example.com",
      "%68ost=remote.example.com", "h%6fst=remote.example.com",
      "%2568ost=remote.example.com", "%64bname=application",
      "opt%69ons=-csearch_path%3Dpublic", "search%5fpath=public",
      "Schema=public", "SCHEMA=public", "sch%65ma=public",
      "schema=public&schema=other", "schema=public&%73chema=other",
      "host=localhost&host=remote.example.com", "host=remote.example.com&host=localhost",
    ]) {
      assert.throws(() => guard.validate(addQuery(query)), /connection overrides/, query)
    }
  })

  test(`${guard.name} guard rejects duplicate schema aliases and all fragments`, () => {
    for (const query of [
      `schema=${guard.schema ?? "public"}`,
      `%73chema=${guard.schema ?? "public"}`,
    ]) {
      const duplicate = guard.schema
        ? addQuery(query)
        : `${base}?schema=public&${query}`
      assert.throws(() => guard.validate(duplicate), /connection overrides/, duplicate)
    }
    for (const fragment of ["#", "#fragment", "#?host=remote.example.com"]) {
      assert.throws(() => guard.validate(valid + fragment), /connection overrides/, fragment)
    }
  })
}
