import { requireDisposableTestDatabaseUrl } from "./disposable-test-database"

export function requireQuestionTestDatabaseUrl(value: string | undefined) {
  return requireDisposableTestDatabaseUrl(value, {
    variable: "QUESTION_TEST_DATABASE_URL",
    schemaPattern: /^question_test_[a-z0-9_]+$/,
    isolationMessage: "Question tests require a disposable test database and isolated question_test_* schema",
  })
}
