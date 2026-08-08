import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { LoginAttemptLimiter } from "../lib/auth/login-attempt-limiter"
import { validateOrigin } from "../lib/csrf"

test("login failure records expire even before the lockout threshold", () => {
  let now = 1_000
  const limiter = new LoginAttemptLimiter(5, 300_000, () => now)

  limiter.recordFailure("client-a")
  assert.equal(limiter.size, 1)
  assert.equal(limiter.isBlocked("client-a"), false)

  now += 300_000
  limiter.cleanup()
  assert.equal(limiter.size, 0)
})

test("login limiter blocks at the threshold and resets after the window", () => {
  let now = 1_000
  const limiter = new LoginAttemptLimiter(5, 300_000, () => now)

  for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure("client-a")
  assert.equal(limiter.isBlocked("client-a"), true)

  now += 300_000
  assert.equal(limiter.isBlocked("client-a"), false)
  assert.equal(limiter.size, 0)
})

test("production origin validation rejects localhost and accepts the canonical site", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  Reflect.set(process.env, "NODE_ENV", "production")
  Reflect.set(process.env, "NEXT_PUBLIC_SITE_URL", "https://liaoqizai.site")

  try {
    const localhost = new NextRequest("https://liaoqizai.site/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    })
    const canonical = new NextRequest("https://liaoqizai.site/api/auth/login", {
      method: "POST",
      headers: { origin: "https://liaoqizai.site" },
    })
    assert.equal(validateOrigin(localhost, { requireOrigin: true }), false)
    assert.equal(validateOrigin(canonical, { requireOrigin: true }), true)
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
    else Reflect.set(process.env, "NODE_ENV", previousNodeEnv)
    if (previousSiteUrl === undefined) Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SITE_URL")
    else Reflect.set(process.env, "NEXT_PUBLIC_SITE_URL", previousSiteUrl)
  }
})
