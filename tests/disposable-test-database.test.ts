import assert from "node:assert/strict"
import test from "node:test"
import { requireQuestionTestDatabaseUrl } from "./question-test-database"
import { requireBlogSeriesTestDatabaseUrl } from "./blog-series-test-database"

for (const policy of [
  { validate: requireQuestionTestDatabaseUrl, variable: "QUESTION_TEST_DATABASE_URL", prefix: "question_test_", name: "Question" },
  { validate: requireBlogSeriesTestDatabaseUrl, variable: "BLOG_SERIES_TEST_DATABASE_URL", prefix: "blog_series_test_", name: "Blog Series" },
]) {
  const schema = `${policy.prefix}run_1`
  const isolationMessage = `${policy.name} tests require a disposable test database and isolated ${policy.prefix}* schema`
  const refusal = "Refusing to use a non-test or production-looking database host"
  const url = (host = "localhost", database = "my_test", targetSchema = schema, protocol = "postgresql") =>
    `${protocol}://user@${host}/${database}?schema=${targetSchema}`

  test(`${policy.name} database guard preserves accepted destinations and return values`, () => {
    for (const host of ["localhost", "127.0.0.1:55439", "[::1]", "test.example.com", "db-test.example.com", "db.test.example.com"]) {
      for (const protocol of ["postgres", "postgresql"]) {
        const original = url(host, "My_%74est", schema, protocol)
        const result = policy.validate(original)
        assert.equal(result.url, original)
        assert.ok(result.parsed instanceof URL)
        assert.equal(result.parsed.href, new URL(original).href)
        assert.equal(result.databaseName, "my_test")
        assert.equal(result.schema, schema)
      }
    }
  })

  test(`${policy.name} database guard preserves rejection order and exact messages`, () => {
    const cases: Array<[string | undefined, string]> = [
      [undefined, `${policy.variable} is required`],
      ["", `${policy.variable} is required`],
      ["invalid", `${policy.variable} must be a valid PostgreSQL URL`],
      [url("localhost", "my_test", schema, "https"), `${policy.variable} must use postgres:// or postgresql://`],
      [url("localhost", "ordinary"), isolationMessage],
      [url("localhost", "test", "public"), isolationMessage],
      [url("localhost", "test", policy.prefix), isolationMessage],
      [url("localhost", "test", `${policy.prefix}UPPER`), isolationMessage],
      [url("localhost", "test", `${policy.prefix}hyphen-name`), isolationMessage],
      [url("example.com"), refusal],
      [url("contest.example.com"), refusal],
      [url("liaoqizai.site"), refusal],
      [url("prod-test.example.com"), refusal],
      [url("localhost", "production_test"), refusal],
      [url("localhost", "test", `${policy.prefix}prod`), refusal],
      [url("prod.example.com", "ordinary", "public"), isolationMessage],
    ]
    for (const [value, message] of cases) {
      assert.throws(() => policy.validate(value), { message }, value ?? "undefined")
    }
    assert.throws(() => policy.validate(url("localhost", "%ZZtest")), URIError)
  })
}
