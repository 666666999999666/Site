import assert from "node:assert/strict"
import test from "node:test"
import { requireDailyTestDatabaseUrl, requireDailyFixtureLogin, requireEmptyDailyTestAccounts } from "./daily-test-database"

const url = "postgresql://fixture@127.0.0.1:55439/daily_test?schema=daily_test_run_12345678"

test("Daily browser guard accepts only explicit local disposable schemas", () => {
  assert.deepEqual(requireDailyTestDatabaseUrl(url), { url, schema: "daily_test_run_12345678" })
  assert.throws(() => requireDailyTestDatabaseUrl(undefined), /DAILY_TEST_DATABASE_URL is required/)
  for (const invalid of [
    "not-a-url", url.replace("postgresql:", "https:"), url.replace("127.0.0.1", "test.example.com"),
    url.replace("daily_test?", "production_test?"), url.replace("daily_test?", "site?"),
    url.replace("daily_test_run_12345678", "public"), url.replace("daily_test_run_12345678", "daily_test_short"),
    `${url}&schema=public`, `${url}&host=production.example.com`, `${url}&host=localhost`,
    `${url}&options=-csearch_path%3Dpublic`, `${url}&search_path=public`, `${url}&dbname=site`,
    `${url}&user=other`, `${url}&sslmode=disable`, `${url}#ignored`,
    url.replace("daily_test?", "daily_test%2Fother?"), url.replace("run_12345678", "prod_12345678"),
  ]) assert.throws(() => requireDailyTestDatabaseUrl(invalid), Error, invalid)
})

test("Daily browser writes require an empty schema account set and exact fixture identity", () => {
  requireEmptyDailyTestAccounts(0)
  for (const count of [1, 2, -1, NaN]) assert.throws(() => requireEmptyDailyTestAccounts(count), /empty account set/)
  const fixture = { id: "fixture-id", username: "daily-e2e-fixture" }
  requireDailyFixtureLogin({ userId: fixture.id, username: fixture.username }, fixture)
  for (const login of [{}, { userId: "other", username: fixture.username }, { userId: fixture.id, username: "admin" }]) {
    assert.throws(() => requireDailyFixtureLogin(login, fixture), /own fixture account/)
  }
})
