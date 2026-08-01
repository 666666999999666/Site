import assert from "node:assert/strict"
import test from "node:test"
import { decodeRouteSegment } from "../lib/route-segment"

test("decodes a percent-encoded Unicode blog slug", () => {
  assert.equal(
    decodeRouteSegment("s0-s2%E9%98%B6%E6%AE%B5%E5%AD%A6%E4%B9%A0"),
    "s0-s2阶段学习"
  )
})

test("leaves plain and malformed route segments unchanged", () => {
  assert.equal(decodeRouteSegment("ms1x2b2g"), "ms1x2b2g")
  assert.equal(decodeRouteSegment("broken%slug"), "broken%slug")
})
