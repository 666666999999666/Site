import assert from "node:assert/strict"
import test from "node:test"
import { apiRequest, jsonRequest } from "../lib/api-client"
import {
  QuestionApiError,
  questionApiRequest,
  questionErrorMessage,
  questionJsonRequest,
} from "../components/questions/api"

for (const [label, request, ErrorType] of [
  ["ordinary", apiRequest, Error],
  ["question", questionApiRequest, QuestionApiError],
] as const) {
  test(`${label} HTTP transport preserves successful JSON and passes fetch arguments through`, async (context) => {
    const input = new URL("https://example.test/resource")
    const init = { method: "POST", headers: { "X-Test": "yes" }, body: "{}" }
    const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ id: "item-1" }))
    assert.deepEqual(await request(input, init), { id: "item-1" })
    assert.deepEqual(fetchMock.mock.calls[0].arguments, [input, init])
  })

  test(`${label} HTTP transport returns null when successful JSON cannot be parsed`, async (context) => {
    context.mock.method(globalThis, "fetch", async () => new Response("not JSON"))
    assert.equal(await request("/resource"), null)
  })

  test(`${label} HTTP transport retains error type, message, and fallbacks`, async (context) => {
    const cases = [
      { status: 409, payload: { error: "请重新同步", code: "RESYNC_REQUIRED" }, message: "请重新同步" },
      { status: 413, payload: { error: "图片过大", code: "IMAGE_TOO_LARGE" }, message: "图片过大" },
      { status: 400, payload: { error: "", code: "VALIDATION_ERROR" }, message: "请求失败（400）" },
      { status: 401, payload: {}, message: "请求失败（401）" },
      { status: 500, payload: null, message: "请求失败（500）" },
    ]
    let response: Response
    context.mock.method(globalThis, "fetch", async () => response)
    for (const item of cases) {
      response = item.payload === null
        ? new Response("upstream unavailable", { status: item.status })
        : Response.json(item.payload, { status: item.status })
      await assert.rejects(request("/resource"), (error: unknown) => {
        assert.ok(error instanceof ErrorType)
        assert.equal(error.name, ErrorType.name)
        assert.equal(error.message, item.message)
        if (error instanceof QuestionApiError) {
          assert.equal(error.status, item.status)
          assert.equal(error.code, item.payload && "code" in item.payload ? item.payload.code : undefined)
        } else {
          assert.equal("status" in error, false)
          assert.equal("code" in error, false)
        }
        return true
      })
    }
  })

  test(`${label} HTTP transport propagates the original network error`, async (context) => {
    const networkError = new TypeError("fetch failed")
    context.mock.method(globalThis, "fetch", async () => { throw networkError })
    await assert.rejects(request("/resource"), (error) => error === networkError)
  })
}

test("ordinary and question JSON requests retain exact method, header, and serialization", () => {
  for (const makeRequest of [jsonRequest, questionJsonRequest]) {
    assert.deepEqual(makeRequest("PATCH", { text: " 原文\r\n", missing: undefined, empty: null }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: '{"text":" 原文\\r\\n","empty":null}',
    })
    assert.equal(makeRequest("DELETE", undefined).body, undefined)
    assert.throws(() => makeRequest("POST", { value: BigInt(1) }), TypeError)
  }
})

test("question error feedback preserves errors and uses fallback only for non-errors", () => {
  assert.equal(questionErrorMessage(new QuestionApiError("冲突", 409, "RESYNC_REQUIRED")), "冲突")
  assert.equal(questionErrorMessage(new Error("")), "")
  assert.equal(questionErrorMessage(null), "操作失败")
  assert.equal(questionErrorMessage("untrusted", "重试"), "重试")
})
