import assert from "node:assert/strict"
import test from "node:test"
import {
  isQuestionSmokeRequest,
  QuestionSmokeError,
  runQuestionSmoke,
  type QuestionSmokeDependencies,
} from "../lib/questions/internal-smoke"

const REVIEW_KEY = "2c1fcf88-1179-4e73-b045-b18ebdc4a1c6"

function requestWithHeaders(headers: HeadersInit): Pick<Request, "headers"> {
  return { headers: new Headers(headers) }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fakeDependencies(options?: {
  leakAnswer?: boolean
  failSession?: boolean
  failAt?: "create" | "start" | "reveal" | "rating"
  cleanupFails?: boolean
}) {
  const calls: Array<{ path: string; init: RequestInit }> = []
  const cleaned: string[] = []
  let referenceAnswer = ""

  const dependencies: QuestionSmokeDependencies = {
    async createIdentity() {
      return {
        userId: "smoke-user",
        email: "smoke@example.invalid",
        password: "ephemeral-password-never-returned",
      }
    },
    async createSession() {
      if (options?.failSession) throw new QuestionSmokeError("session")
      return {
        cookie: "qz_oauth.session_token=signed-test-token",
        origin: "https://liaoqizai.site",
      }
    },
    async request(path, init) {
      calls.push({ path, init })
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      if (path === "/api/questions") {
        referenceAnswer = String(body.referenceAnswerMarkdown)
        return options?.failAt === "create" ? jsonResponse({}, 500) : jsonResponse({ id: "q1" }, 201)
      }
      if (path === "/api/questions/today/start") {
        return options?.failAt === "start"
          ? jsonResponse({}, 500)
          : jsonResponse({
              state: "READY",
              question: {
                id: "q1",
                promptMarkdown: "Question smoke",
                reviewKey: REVIEW_KEY,
                contentVersion: 1,
                scheduleVersion: 1,
                ...(options?.leakAnswer ? { referenceAnswerMarkdown: referenceAnswer } : {}),
              },
            })
      }
      if (path.endsWith("/reveal")) {
        return options?.failAt === "reveal"
          ? jsonResponse({}, 409)
          : jsonResponse({ referenceAnswerMarkdown: referenceAnswer, directReveal: false, attempts: [] })
      }
      return options?.failAt === "rating"
        ? jsonResponse({}, 409)
        : jsonResponse({ rating: "GOOD", reviewRevision: 0 })
    },
    async cleanup(userId) {
      cleaned.push(userId)
      if (options?.cleanupFails) throw new Error("database unavailable")
    },
  }

  return { dependencies, calls, cleaned }
}

test("Question smoke only accepts direct loopback requests", () => {
  assert.equal(isQuestionSmokeRequest(requestWithHeaders({ host: "127.0.0.1:3000" })), true)
  assert.equal(isQuestionSmokeRequest(requestWithHeaders({
    host: "127.0.0.1:3000",
    "x-forwarded-for": "203.0.113.9, 127.0.0.1",
  })), false)
  assert.equal(isQuestionSmokeRequest(requestWithHeaders({
    host: "127.0.0.1:3000",
    forwarded: "for=203.0.113.9;host=127.0.0.1:3000",
  })), false)
  assert.equal(isQuestionSmokeRequest(requestWithHeaders({ host: "liaoqizai.site" })), false)
})

test("Question smoke uses the real HTTP route sequence and returns no credentials", async () => {
  const fake = fakeDependencies()
  const result = await runQuestionSmoke(fake.dependencies)

  assert.deepEqual(result, { ok: true, flow: "typed-good", cleaned: true })
  assert.deepEqual(fake.cleaned, ["smoke-user"])
  assert.deepEqual(fake.calls.map(({ path, init }) => `${init.method} ${path}`), [
    "POST /api/questions",
    "POST /api/questions/today/start",
    `POST /api/questions/reviews/${REVIEW_KEY}/reveal`,
    `PUT /api/questions/reviews/${REVIEW_KEY}/rating`,
  ])
  const ratingBody = JSON.parse(String(fake.calls[3]?.init.body)) as Record<string, unknown>
  assert.equal(ratingBody.operation, "CREATE")
  assert.equal(ratingBody.rating, "GOOD")
  assert.equal(JSON.stringify(result).includes("ephemeral-password"), false)
  for (const call of fake.calls) {
    const headers = new Headers(call.init.headers)
    assert.equal(headers.get("cookie"), "qz_oauth.session_token=signed-test-token")
    assert.equal(headers.get("origin"), "https://liaoqizai.site")
  }
})

test("Question smoke rejects a pre-reveal answer leak and still cleans up", async () => {
  const fake = fakeDependencies({ leakAnswer: true })

  await assert.rejects(
    runQuestionSmoke(fake.dependencies),
    (error: unknown) => error instanceof QuestionSmokeError && error.stage === "start_privacy"
  )
  assert.deepEqual(fake.cleaned, ["smoke-user"])
  assert.equal(fake.calls.length, 2)
})

test("Question smoke turns every HTTP failure into an error and still cleans up", async () => {
  for (const stage of ["create", "start", "reveal", "rating"] as const) {
    const fake = fakeDependencies({ failAt: stage })
    await assert.rejects(
      runQuestionSmoke(fake.dependencies),
      (error: unknown) => error instanceof QuestionSmokeError && error.stage === stage
    )
    assert.deepEqual(fake.cleaned, ["smoke-user"])
  }
})

test("Question smoke cleans up an identity when credential session creation fails", async () => {
  const fake = fakeDependencies({ failSession: true })
  await assert.rejects(
    runQuestionSmoke(fake.dependencies),
    (error: unknown) => error instanceof QuestionSmokeError && error.stage === "session"
  )
  assert.deepEqual(fake.cleaned, ["smoke-user"])
  assert.equal(fake.calls.length, 0)
})

test("Question smoke reports cleanup failures on both success and failure paths", async () => {
  const success = fakeDependencies({ cleanupFails: true })
  await assert.rejects(
    runQuestionSmoke(success.dependencies),
    (error: unknown) => error instanceof QuestionSmokeError && error.stage === "cleanup"
  )

  const failed = fakeDependencies({ failAt: "reveal", cleanupFails: true })
  await assert.rejects(
    runQuestionSmoke(failed.dependencies),
    (error: unknown) => error instanceof QuestionSmokeError && error.stage === "cleanup_after_failure"
  )
  assert.deepEqual(failed.cleaned, ["smoke-user"])
})
