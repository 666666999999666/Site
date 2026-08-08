import assert from "node:assert/strict"
import test from "node:test"
import { buildContentSecurityPolicy } from "../lib/csp"

test("production CSP keeps scripts strict while allowing required style attributes", () => {
  const policy = buildContentSecurityPolicy("test-nonce", false)

  assert.match(policy, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic'/)
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/)
  assert.match(policy, /script-src-attr 'none'/)
  assert.match(policy, /style-src 'self' 'unsafe-inline'/)
  assert.match(policy, /upgrade-insecure-requests/)
})
