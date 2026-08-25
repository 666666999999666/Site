import assert from "node:assert/strict"
import test from "node:test"

const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567"

test("the health route couples database health to an immutable release SHA", async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL
  const previousReleaseSha = process.env.APP_RELEASE_SHA
  process.env.DATABASE_URL = "postgresql://health:health@127.0.0.1:65432/health"

  const [{ prisma }, { GET }] = await Promise.all([
    import("../lib/db"),
    import("../app/api/health/route"),
  ])
  const originalQueryRaw = prisma.$queryRaw
  const originalConsoleError = console.error

  context.after(() => {
    Object.defineProperty(prisma, "$queryRaw", {
      configurable: true,
      writable: true,
      value: originalQueryRaw,
    })
    console.error = originalConsoleError
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
    if (previousReleaseSha === undefined) delete process.env.APP_RELEASE_SHA
    else process.env.APP_RELEASE_SHA = previousReleaseSha
  })

  await context.test("rejects a missing or malformed release identity before probing the database", async () => {
    let probes = 0
    Object.defineProperty(prisma, "$queryRaw", {
      configurable: true,
      writable: true,
      value: async () => {
        probes += 1
        return 1
      },
    })

    for (const releaseSha of [undefined, RELEASE_SHA.toUpperCase(), "abc"]) {
      if (releaseSha === undefined) delete process.env.APP_RELEASE_SHA
      else process.env.APP_RELEASE_SHA = releaseSha
      const response = await GET()
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { status: "unavailable" })
      assert.equal(response.headers.get("cache-control"), "no-store")
    }
    assert.equal(probes, 0)
  })

  await context.test("returns the exact release identity after a successful database probe", async () => {
    process.env.APP_RELEASE_SHA = RELEASE_SHA
    Object.defineProperty(prisma, "$queryRaw", {
      configurable: true,
      writable: true,
      value: async () => 1,
    })

    const response = await GET()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: "ok", releaseSha: RELEASE_SHA })
    assert.equal(response.headers.get("cache-control"), "no-store")
  })

  await context.test("returns 503 without exposing database error details", async () => {
    process.env.APP_RELEASE_SHA = RELEASE_SHA
    Object.defineProperty(prisma, "$queryRaw", {
      configurable: true,
      writable: true,
      value: async () => {
        throw new Error("secret database detail")
      },
    })
    console.error = () => undefined

    const response = await GET()
    assert.equal(response.status, 503)
    const payload = await response.json()
    assert.deepEqual(payload, { status: "unavailable", releaseSha: RELEASE_SHA })
    assert.doesNotMatch(JSON.stringify(payload), /secret database detail/)
    assert.equal(response.headers.get("cache-control"), "no-store")
  })
})
