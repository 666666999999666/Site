import assert from "node:assert/strict"
import test from "node:test"
import { isDirectLoopbackRequest } from "../lib/mcp/internal-request"

function requestWithHeaders(headers: HeadersInit): Pick<Request, "headers"> {
  return { headers: new Headers(headers) }
}

test("accepts direct and Next.js-normalized loopback maintenance requests", () => {
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({ host: "127.0.0.1:3000" })), true)
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({
    host: "127.0.0.1:3000",
    "x-forwarded-host": "127.0.0.1:3000",
    "x-forwarded-for": "::ffff:127.0.0.1",
  })), true)
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({
    host: "[::1]:3000",
    "x-real-ip": "::1",
  })), true)
})

test("rejects non-loopback hosts and forwarded clients", () => {
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({ host: "liaoqizai.site" })), false)
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({
    host: "127.0.0.1:3000",
    "x-forwarded-host": "liaoqizai.site",
  })), false)
  assert.equal(isDirectLoopbackRequest(requestWithHeaders({
    host: "127.0.0.1:3000",
    "x-forwarded-for": "203.0.113.10, 127.0.0.1",
  })), false)
})
