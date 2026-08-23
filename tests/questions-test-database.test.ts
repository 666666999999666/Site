import assert from "node:assert/strict"
import test from "node:test"
import { requireQuestionTestDatabaseUrl } from "./question-test-database"

test("question test database guard accepts a local disposable schema", () => {
  const result = requireQuestionTestDatabaseUrl(
    "postgresql://postgres@127.0.0.1:55439/question_test?schema=question_test_run_1"
  )
  assert.equal(result.schema, "question_test_run_1")
})

test("question test database guard rejects production and generic remote hosts", () => {
  assert.throws(
    () => requireQuestionTestDatabaseUrl(
      "postgresql://user@example.com/question_test?schema=question_test_run_1"
    ),
    /Refusing/
  )
  assert.throws(
    () => requireQuestionTestDatabaseUrl(
      "postgresql://user@liaoqizai.site/question_test?schema=question_test_run_1"
    ),
    /Refusing/
  )
})
