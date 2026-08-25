import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import path from "node:path"
import bcrypt from "bcryptjs"
import { Client as PgClient } from "pg"

const OAUTH_MIGRATION = "20260809030000_better_auth_oauth_mcp"
const FINAL_MIGRATION = "20260810090000_remote_oauth_markdown_import"
const BETTER_AUTH_1_7_MIGRATION = "20260825010000_better_auth_1_7"
const OLD_PASSWORD = "Old9Pass!"
const NEW_PASSWORD = "oauth-test-password-2026-updated!"
const ADMIN_ID = "oauth-admin"
const ADMIN_EMAIL = "admin@liaoqizai.site"
const ALL_SCOPES = [
  "draft:import",
  "draft:read",
  "draft:update",
  "category:create",
  "todo:convert",
  "offline_access",
].join(" ")

interface RegisteredClient {
  client_id: string
  client_name?: string
  redirect_uris: string[]
  token_endpoint_auth_method: string
  application_type: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

function progress(step: string) {
  process.stdout.write(`[oauth-integration] ${step}\n`)
}

function requireTestDatabaseUrl(): string {
  const value = process.env.MCP_OAUTH_TEST_DATABASE_URL
  assert.ok(value, "MCP_OAUTH_TEST_DATABASE_URL is required")
  const parsed = new URL(value)
  const database = parsed.pathname.replace(/^\//, "").toLowerCase()
  assert.match(database, /test/, "OAuth integration database name must contain 'test'")
  assert.ok(
    ["127.0.0.1", "localhost"].includes(parsed.hostname),
    "OAuth integration database must be local"
  )
  return value
}

async function resetDatabase(client: PgClient): Promise<string> {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
  const migrationsRoot = path.join(process.cwd(), "prisma", "migrations")
  const directories = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.ok(directories.includes(FINAL_MIGRATION))
  assert.ok(directories.includes(BETTER_AUTH_1_7_MIGRATION))

  for (const directory of directories.filter((name) => name < OAUTH_MIGRATION)) {
    const sql = await readFile(path.join(migrationsRoot, directory, "migration.sql"), "utf8")
    await client.query(sql)
  }

  const oldHash = await bcrypt.hash(OLD_PASSWORD, 12)
  await client.query(
    'INSERT INTO "User" ("id", "username", "passwordHash", "passwordVersion") VALUES ($1, $2, $3, 1)',
    [ADMIN_ID, "admin", oldHash]
  )
  const oauthSql = await readFile(
    path.join(migrationsRoot, OAUTH_MIGRATION, "migration.sql"),
    "utf8"
  )
  await client.query(oauthSql)

  const legacyClientId = "legacy-scope-migration-client"
  const legacyCredentialId = randomUUID()
  await client.query(`
    INSERT INTO "OauthClient" ("id", "clientId", "redirectUris", "createdAt", "updatedAt")
    VALUES ($1, $2, ARRAY['https://client.example/callback'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [randomUUID(), legacyClientId])
  await client.query(`
    INSERT INTO "McpCredential"
      ("id", "kind", "name", "oauthClientId", "oauthSubject", "scopes", "createdAt", "updatedAt")
    VALUES (
      $1, 'OAUTH', 'Legacy Agent', $2, $3, ARRAY['draft:create', 'draft:read'],
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `, [legacyCredentialId, legacyClientId, ADMIN_ID])

  const finalSql = await readFile(path.join(migrationsRoot, FINAL_MIGRATION, "migration.sql"), "utf8")
  await client.query(finalSql)
  const migratedCredential = await client.query<{ scopes: string[]; revokedAt: Date | null }>(`
    SELECT "scopes", "revokedAt" FROM "McpCredential" WHERE "id" = $1
  `, [legacyCredentialId])
  assert.deepEqual(migratedCredential.rows[0].scopes, ["draft:import", "draft:read"])
  assert.ok(migratedCredential.rows[0].revokedAt)
  assert.equal((await client.query(
    'SELECT COUNT(*)::int AS count FROM "OauthClient" WHERE "clientId" = $1',
    [legacyClientId]
  )).rows[0].count, 0)
  await client.query('DELETE FROM "McpCredential" WHERE "id" = $1', [legacyCredentialId])

  for (const directory of directories.filter(
    (name) => name > FINAL_MIGRATION && name < BETTER_AUTH_1_7_MIGRATION
  )) {
    const sql = await readFile(path.join(migrationsRoot, directory, "migration.sql"), "utf8")
    await client.query(sql)
  }

  const betterAuthUpgradeSql = await readFile(
    path.join(migrationsRoot, BETTER_AUTH_1_7_MIGRATION, "migration.sql"),
    "utf8"
  )
  await client.query(betterAuthUpgradeSql)

  const migrated = await client.query<{
    passwordVersion: number
    email: string
    name: string
    accountPassword: string
  }>(`
    SELECT u."passwordVersion", u."email", u."name", a."password" AS "accountPassword"
    FROM "User" u
    JOIN "Account" a ON a."userId" = u."id" AND a."providerId" = 'credential'
    WHERE u."id" = $1
  `, [ADMIN_ID])
  assert.equal(migrated.rows[0].passwordVersion, 2)
  assert.equal(migrated.rows[0].email, ADMIN_EMAIL)
  assert.equal(migrated.rows[0].name, "admin")
  assert.equal(migrated.rows[0].accountPassword, oldHash)
  return oldHash
}

async function nodeRequestToWebRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const method = request.method ?? "GET"
  const headers = new Headers()
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    headers.append(request.rawHeaders[index], request.rawHeaders[index + 1])
  }
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`)
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
  })
}

async function writeWebResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") target.setHeader(name, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) target.setHeader("set-cookie", cookies)
  target.end(Buffer.from(await response.arrayBuffer()))
}

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ")
}

async function jsonResponse<T>(response: Response, expectedStatus: number): Promise<T> {
  const text = await response.text()
  assert.equal(response.status, expectedStatus, text)
  return JSON.parse(text) as T
}

function formBody(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values)
}

function oauthPageSearchParams(values: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(values.keys())) {
    const items = values.getAll(key)
    result[key] = items.length === 1 ? items[0] : items
  }
  return result
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

function mutateSignature(token: string): string {
  const parts = token.split(".")
  assert.equal(parts.length, 3)
  const first = parts[2].at(0)
  parts[2] = `${first === "A" ? "B" : "A"}${parts[2].slice(1)}`
  return parts.join(".")
}

async function redirectTarget(response: Response): Promise<string> {
  const location = response.headers.get("location")
  if (location) {
    assert.ok(response.status >= 300 && response.status < 400)
    return location
  }
  const body = await jsonResponse<{ url?: string }>(response, 200)
  assert.ok(body.url, "OAuth redirect response did not include a URL")
  return body.url
}

async function main() {
  const databaseUrl = requireTestDatabaseUrl()
  const pg = new PgClient({ connectionString: databaseUrl })
  await pg.connect()
  await resetDatabase(pg)
  progress("migrations and legacy scope migration verified")

  let oauthRouteHandler: ((request: Request) => Promise<Response>) | null = null
  const server = createServer(async (request, response) => {
    try {
      if (!oauthRouteHandler) throw new Error("OAuth handler is not ready")
      const webRequest = await nodeRequestToWebRequest(request)
      await writeWebResponse(await oauthRouteHandler(webRequest), response)
    } catch (error) {
      response.statusCode = 500
      response.end(error instanceof Error ? error.stack : String(error))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const origin = `http://127.0.0.1:${address.port}`
  process.env.DATABASE_URL = databaseUrl
  process.env.SESSION_SECRET = "oauth-integration-session-secret-2026-08-09-long"
  process.env.NEXT_PUBLIC_SITE_URL = origin
  Object.assign(process.env, { NODE_ENV: "test" })
  process.env.MCP_CREDENTIAL_RATE_LIMIT_PER_MINUTE = "100"
  process.env.MCP_SEARCH_RATE_LIMIT_PER_MINUTE = "30"
  process.env.MCP_WRITE_RATE_LIMIT_PER_MINUTE = "30"

  const [
    { auth },
    { prisma },
    authContext,
    credentials,
    toolService,
    approvalService,
    authService,
    rateLimitService,
    auditService,
    maintenanceService,
  ] = await Promise.all([
    import("../lib/auth/better-auth"),
    import("../lib/db"),
    import("../lib/mcp/auth-context"),
    import("../lib/mcp/credential-service"),
    import("../lib/mcp/tool-service"),
    import("../lib/mcp/approval-service"),
    import("../lib/auth/service"),
    import("../lib/mcp/rate-limit-service"),
    import("../lib/mcp/audit-service"),
    import("../lib/mcp/maintenance-service"),
  ])
  progress("application modules loaded")
  const timedFetch = (input: string | URL, init?: RequestInit) => fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  })
  const oauthFetch = (pathname: string, init?: RequestInit) => timedFetch(`${origin}/api/oauth${pathname}`, {
    ...init,
    redirect: "manual",
  })

  const [
    oauthMetadata,
    oauthConfig,
    mcpRoute,
    authMetadataRoute,
    legacyToolRoute,
    oauthResourceValidation,
    oauthRoute,
    nextServer,
  ] = await Promise.all([
    import("../lib/auth/oauth-metadata"),
    import("../lib/auth/oauth-config"),
    import("../app/api/mcp/route"),
    import("../app/.well-known/oauth-authorization-server/api/oauth/route"),
    import("../app/api/mcp/gateway/tools/[tool]/route"),
    import("../lib/auth/oauth-resource-validation"),
    import("../app/api/oauth/[...all]/route"),
    import("next/server"),
  ])
  oauthRouteHandler = (request) => {
    const handler = request.method === "GET" ? oauthRoute.GET : oauthRoute.POST
    return handler(request)
  }
  const protectedMetadata = oauthMetadata.protectedResourceMetadata()
  assert.equal(protectedMetadata.resource, `${origin}/api/mcp`)
  assert.deepEqual(protectedMetadata.authorization_servers, [`${origin}/api/oauth`])
  assert.deepEqual(protectedMetadata.scopes_supported, ALL_SCOPES.split(" ").filter((scope) => scope !== "offline_access"))
  const authorizationMetadataResponse = await authMetadataRoute.GET(
    new Request(`${origin}/.well-known/oauth-authorization-server/api/oauth`)
  )
  const authorizationMetadata = await jsonResponse<{
    issuer: string
    registration_endpoint: string
    token_endpoint: string
    code_challenge_methods_supported: string[]
    token_endpoint_auth_methods_supported: string[]
    revocation_endpoint_auth_methods_supported: string[]
  }>(authorizationMetadataResponse, 200)
  assert.equal(authorizationMetadata.issuer, `${origin}/api/oauth`)
  assert.equal(authorizationMetadata.registration_endpoint, `${origin}/api/oauth/oauth2/register`)
  assert.equal(authorizationMetadata.token_endpoint, `${origin}/api/oauth/oauth2/token`)
  assert.deepEqual(authorizationMetadata.code_challenge_methods_supported, ["S256"])
  assert.deepEqual(authorizationMetadata.token_endpoint_auth_methods_supported, ["none"])
  assert.deepEqual(authorizationMetadata.revocation_endpoint_auth_methods_supported, ["none"])

  const unauthenticatedMcp = await mcpRoute.POST(new nextServer.NextRequest(`${origin}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }))
  assert.equal(unauthenticatedMcp.status, 401)
  assert.match(unauthenticatedMcp.headers.get("www-authenticate") ?? "", /resource_metadata=/)
  const invalidOriginMcp = await mcpRoute.POST(new nextServer.NextRequest(`${origin}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.invalid" },
    body: "{}",
  }))
  assert.equal(invalidOriginMcp.status, 403)
  assert.equal(legacyToolRoute.POST().status, 410)
  const missingAuthorizeResource = await oauthResourceValidation.validateOAuthMcpResource(
    new Request(`${origin}/api/oauth/oauth2/authorize?client_id=test`)
  )
  assert.equal(missingAuthorizeResource?.status, 400)
  const wrongTokenResource = await oauthResourceValidation.validateOAuthMcpResource(
    new Request(`${origin}/api/oauth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        grant_type: "authorization_code",
        resource: `${origin}/wrong-resource`,
      }),
    })
  )
  assert.equal(wrongTokenResource?.status, 400)
  const blockedPasswordLogin = await oauthRoute.POST(new Request(`${origin}/api/oauth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: OLD_PASSWORD }),
  }))
  assert.equal(blockedPasswordLogin.status, 404)
  const oversizedClientName = await oauthRoute.POST(new Request(`${origin}/api/oauth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      client_name: "x".repeat(81),
      redirect_uris: [`${origin}/callback`],
    }),
  }))
  assert.equal(oversizedClientName.status, 400)
  const confidentialClient = await oauthRoute.POST(new Request(`${origin}/api/oauth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      client_name: "Confidential Client",
      redirect_uris: [`${origin}/callback`],
      token_endpoint_auth_method: "client_secret_post",
    }),
  }))
  assert.equal(confidentialClient.status, 400)
  progress("discovery and unauthenticated boundaries verified")

  const register = async (name: string): Promise<RegisteredClient> => {
    const redirectUri = `${origin}/oauth-test-callback/${encodeURIComponent(name)}`
    const response = await oauthFetch("/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        client_name: name,
        software_id: `qz-test-${name.toLowerCase().replace(/\s+/g, "-")}`,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: "native",
        subject_type: "public",
        scope: ALL_SCOPES,
      }),
    })
    assert.ok([200, 201].includes(response.status), await response.clone().text())
    const client = await response.json() as RegisteredClient
    assert.equal(client.token_endpoint_auth_method, "none")
    assert.equal(client.application_type, "native")
    assert.deepEqual(client.redirect_uris, [redirectUri])
    return client
  }

  const signIn = (await authService.login(
    OLD_PASSWORD,
    "127.0.0.1",
    new Headers({ origin })
  )).response
  assert.equal(signIn.status, 200, await signIn.text())
  const sessionCookie = cookieHeader(signIn)
  assert.match(sessionCookie, /qz_oauth\.session_token=/)
  assert.equal(
    await auth.api.getSession({ headers: new Headers({ cookie: "admin_session=legacy-cookie" }) }),
    null
  )
  progress("administrator login and legacy cookie rejection verified")

  const authorize = async (
    client: RegisteredClient,
    verifyAuthorizationCodeReplay = false
  ): Promise<TokenResponse> => {
    const verifier = randomBytes(48).toString("base64url")
    const authorizationUrl = new URL(`${origin}/api/oauth/oauth2/authorize`)
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      scope: ALL_SCOPES,
      state: randomUUID(),
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "consent",
      resource: `${origin}/api/mcp`,
    }).toString()
    const authorization = await timedFetch(authorizationUrl, { redirect: "manual" })
    const signInLocation = await redirectTarget(authorization)
    const signInUrl = new URL(signInLocation, origin)
    assert.equal(signInUrl.pathname, "/oauth/sign-in")
    const { validateOAuthPageRequest } = await import("../lib/auth/oauth-request")
    const pageSearchParams = oauthPageSearchParams(signInUrl.searchParams)
    const oauthPageRequest = await validateOAuthPageRequest(pageSearchParams)
    assert.ok(oauthPageRequest, "signed OAuth page request should be valid")
    assert.equal(
      oauthPageRequest.client.client_id ?? oauthPageRequest.client.clientId,
      client.client_id
    )
    assert.equal(
      await validateOAuthPageRequest({ ...pageSearchParams, scope: "draft:read" }),
      null,
      "tampered OAuth page request must be rejected"
    )

    const continued = await oauthFetch("/oauth2/continue", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: sessionCookie,
        origin,
      },
      body: JSON.stringify({
        postLogin: true,
        oauth_query: signInUrl.search.slice(1),
      }),
    })
    const continuedBody = await jsonResponse<{ url: string }>(continued, 200)
    const consentUrl = new URL(continuedBody.url, origin)
    assert.equal(consentUrl.pathname, "/oauth/consent")
    assert.ok(await validateOAuthPageRequest(oauthPageSearchParams(consentUrl.searchParams)))

    const consent = await oauthFetch("/oauth2/consent", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: sessionCookie,
        origin,
      },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
    })
    const consentBody = await jsonResponse<{ url: string }>(consent, 200)
    const callback = new URL(consentBody.url)
    assert.equal(callback.origin + callback.pathname, client.redirect_uris[0])
    assert.equal(callback.searchParams.get("iss"), `${origin}/api/oauth`)
    const code = callback.searchParams.get("code")
    assert.ok(code)

    const token = await oauthFetch("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: verifier,
        redirect_uri: client.redirect_uris[0],
        resource: `${origin}/api/mcp`,
      }),
    })
    const tokenBody = await jsonResponse<TokenResponse>(token, 200)
    assert.equal(tokenBody.token_type, "Bearer")
    assert.equal(tokenBody.expires_in, 15 * 60)
    assert.ok(tokenBody.refresh_token.startsWith("qzoauth_rt_"))

    if (verifyAuthorizationCodeReplay) {
      const replay = await oauthFetch("/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: formBody({
          grant_type: "authorization_code",
          client_id: client.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: client.redirect_uris[0],
          resource: `${origin}/api/mcp`,
        }),
      })
      assert.ok(replay.status >= 400)
    }
    return tokenBody
  }

  try {
    const [clientA, clientB] = await Promise.all([
      register("Trae Primary"),
      register("Trae Secondary"),
    ])
    const abandonedClient = await register("Abandoned Agent")
    progress("three public OAuth clients registered")

    const invalidRedirect = new URL(`${origin}/api/oauth/oauth2/authorize`)
    invalidRedirect.search = new URLSearchParams({
      response_type: "code",
      client_id: clientA.client_id,
      redirect_uri: `${origin}/not-registered`,
      scope: ALL_SCOPES,
      code_challenge: pkceChallenge("x".repeat(64)),
      code_challenge_method: "S256",
      resource: `${origin}/api/mcp`,
    }).toString()
    const invalidRedirectResponse = await timedFetch(invalidRedirect, {
      headers: { cookie: sessionCookie },
      redirect: "manual",
    })
    const invalidRedirectLocation = await redirectTarget(invalidRedirectResponse)
    assert.doesNotMatch(invalidRedirectLocation, /code=/)

    const missingPkce = new URL(`${origin}/api/oauth/oauth2/authorize`)
    missingPkce.search = new URLSearchParams({
      response_type: "code",
      client_id: clientA.client_id,
      redirect_uri: clientA.redirect_uris[0],
      scope: ALL_SCOPES,
      resource: `${origin}/api/mcp`,
    }).toString()
    const missingPkceResponse = await timedFetch(missingPkce, {
      headers: { cookie: sessionCookie },
      redirect: "manual",
    })
    const missingPkceLocation = await redirectTarget(missingPkceResponse)
    assert.match(missingPkceLocation, /error=invalid_request/)

    const replayProbeToken = await authorize(abandonedClient, true)
    const replayProbeRefresh = await oauthFetch("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        grant_type: "refresh_token",
        client_id: abandonedClient.client_id,
        refresh_token: replayProbeToken.refresh_token,
        resource: `${origin}/api/mcp`,
      }),
    })
    assert.ok(replayProbeRefresh.status >= 400)

    const tokenA = await authorize(clientA)
    const tokenB = await authorize(clientB)
    progress("PKCE, consent, authorization code and access tokens verified")
    const [storedRefreshTokens, storedSessions] = await Promise.all([
      prisma.oauthRefreshToken.findMany({ select: { sessionId: true } }),
      prisma.session.findMany({ select: { id: true } }),
    ])
    const sessionIds = new Set(storedSessions.map((session) => session.id))
    assert.ok(storedRefreshTokens.length >= 2)
    assert.ok(storedRefreshTokens.every(
      (refreshToken) => refreshToken.sessionId && sessionIds.has(refreshToken.sessionId)
    ), "every refresh token must reference an active database session")
    const refreshAResponse = await oauthFetch("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        grant_type: "refresh_token",
        client_id: clientA.client_id,
        refresh_token: tokenA.refresh_token,
        resource: `${origin}/api/mcp`,
      }),
    })
    const refreshedA = await jsonResponse<TokenResponse>(refreshAResponse, 200)
    assert.equal(typeof refreshedA.refresh_token, "string")
    assert.ok(refreshedA.refresh_token.startsWith("qzoauth_rt_"))
    assert.notEqual(refreshedA.refresh_token, tokenA.refresh_token)
    const rotatedRefreshTokens = await prisma.oauthRefreshToken.findMany({
      where: { clientId: clientA.client_id },
      select: {
        revoked: true,
        rotatedAt: true,
        rotationReplayExpiresAt: true,
        rotationReplayResponse: true,
      },
    })
    assert.equal(rotatedRefreshTokens.length, 2)
    assert.equal(rotatedRefreshTokens.filter((token) => token.revoked === null).length, 1)
    const consumedRefreshToken = rotatedRefreshTokens.find((token) => token.revoked !== null)
    assert.ok(consumedRefreshToken?.rotatedAt)
    assert.equal(consumedRefreshToken.rotationReplayExpiresAt, null)
    assert.equal(consumedRefreshToken.rotationReplayResponse, null)
    const refreshReplay = await oauthFetch("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        grant_type: "refresh_token",
        client_id: clientA.client_id,
        refresh_token: tokenA.refresh_token,
        resource: `${origin}/api/mcp`,
      }),
    })
    assert.ok(
      refreshReplay.status >= 400,
      `consumed refresh token was accepted with status ${refreshReplay.status}`
    )
    assert.equal(
      await prisma.oauthRefreshToken.count({ where: { clientId: clientA.client_id } }),
      0,
      "refresh token replay must invalidate the client token family"
    )

    const oauthRequest = (token: string) => new Request(`${origin}/api/mcp`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const contextA = await authContext.authenticateOAuthMcpRequest(oauthRequest(refreshedA.access_token))
    const contextB = await authContext.authenticateOAuthMcpRequest(oauthRequest(tokenB.access_token))
    assert.notEqual(contextA.credentialId, contextB.credentialId)
    assert.equal(contextA.clientName, "Trae Primary")
    assert.equal(contextB.clientName, "Trae Secondary")

    const marker = randomUUID()
    const bodyMarker = `private-body-${marker}`
    const post = await prisma.post.create({
      data: {
        title: `OAuth test draft ${marker}`,
        content: bodyMarker,
        slug: `oauth-test-${marker}`,
        tags: ["oauth"],
        status: "DRAFT",
      },
    })
    const todo = await prisma.todo.create({ data: { title: `OAuth Todo ${marker}` } })
    const config = {
      approvalTtlHours: 24,
      importUploadTtlMinutes: 20,
      credentialRateLimit: 100,
      searchRateLimit: 20,
      writeRateLimit: 20,
    }

    const search = await toolService.runGatewayMcpTool(contextA, config, "search_drafts", {
      title: marker,
      status: "DRAFT",
      limit: 20,
    })
    assert.equal(search.count, 1)
    const metadataApproval = await toolService.runGatewayMcpTool(contextA, config, "update_draft_metadata", {
      post_id: post.id,
      title: `OAuth approved title ${marker}`,
      draft_metadata: { source: "agent", marker },
    })
    const categoryApproval = await toolService.runGatewayMcpTool(contextA, config, "create_category", {
      name: `OAuth Category ${marker}`,
      type: "BLOG",
      description: "OAuth integration approval",
      color: "#336699",
      sort_order: 7,
    })
    const todoApproval = await toolService.runGatewayMcpTool(contextA, config, "todo_to_draft", {
      todo_id: todo.id,
      mark_done: true,
    })
    for (const result of [metadataApproval, categoryApproval, todoApproval]) {
      assert.equal(result.status, "pending_approval")
    }
    assert.equal((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).title, post.title)
    assert.equal(await prisma.category.count({ where: { name: `OAuth Category ${marker}` } }), 0)
    assert.equal(await prisma.post.count(), 1)

    const approvalId = metadataApproval.approval_id as string
    const pending = await toolService.runGatewayMcpTool(contextA, config, "get_approval_status", {
      approval_id: approvalId,
    })
    assert.equal(pending.status, "pending_approval")
    await assert.rejects(
      toolService.runGatewayMcpTool(contextB, config, "get_approval_status", {
        approval_id: approvalId,
      })
    )
    await approvalService.approveMcpApproval(approvalId)
    const approved = await toolService.runGatewayMcpTool(contextA, config, "get_approval_status", {
      approval_id: approvalId,
    })
    assert.equal(approved.status, "approved")
    assert.equal(approved.post_id, post.id)
    const updatedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    assert.equal(updatedPost.title, `OAuth approved title ${marker}`)
    assert.equal(updatedPost.content, bodyMarker)
    progress("tool scopes, approvals and Agent isolation verified")

    const isolationTool = `oauth-isolation-${marker}`
    await rateLimitService.consumeMcpRateLimit({
      credentialId: contextA.credentialId,
      toolName: isolationTool,
      credentialLimit: 100,
      toolLimit: 1,
    })
    await assert.rejects(rateLimitService.consumeMcpRateLimit({
      credentialId: contextA.credentialId,
      toolName: isolationTool,
      credentialLimit: 100,
      toolLimit: 1,
    }), /调用次数已达上限/)
    await rateLimitService.consumeMcpRateLimit({
      credentialId: contextB.credentialId,
      toolName: isolationTool,
      credentialLimit: 100,
      toolLimit: 1,
    })

    const interruptedAudit = await auditService.beginMcpAudit({
      credentialId: contextB.credentialId,
      toolName: "maintenance_probe",
      parameterSummary: { marker },
    })
    await assert.rejects(auditService.deleteMcpAuditLog(interruptedAudit.id), /执行中/)
    await prisma.mcpAuditLog.update({
      where: { id: interruptedAudit.id },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })
    await Promise.all([
      prisma.mcpApproval.updateMany({
        where: {
          id: {
            in: [
              categoryApproval.approval_id as string,
              todoApproval.approval_id as string,
            ],
          },
        },
        data: { expiresAt: new Date(Date.now() - 60 * 1000) },
      }),
      prisma.oauthClient.update({
        where: { clientId: abandonedClient.client_id },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      }),
      prisma.mcpRateLimit.updateMany({
        where: { toolName: isolationTool },
        data: { windowStart: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      }),
    ])
    const maintenance = await maintenanceService.runMcpMaintenance({
      force: true,
      now: new Date(),
    })
    assert.ok(maintenance.expiredApprovals >= 2)
    assert.ok(maintenance.interruptedAudits >= 1)
    assert.ok(maintenance.rateLimitBuckets >= 1)
    assert.ok(maintenance.abandonedOAuthClients >= 1)
    assert.equal(await prisma.oauthClient.count({ where: { clientId: abandonedClient.client_id } }), 0)
    const recoveredAudit = await prisma.mcpAuditLog.findUniqueOrThrow({
      where: { id: interruptedAudit.id },
    })
    assert.equal(recoveredAudit.status, "INTERRUPTED")
    await auditService.deleteMcpAuditLog(interruptedAudit.id)
    for (const approvalIdToCheck of [
      categoryApproval.approval_id as string,
      todoApproval.approval_id as string,
    ]) {
      const expiredApproval = await prisma.mcpApproval.findUniqueOrThrow({
        where: { id: approvalIdToCheck },
      })
      assert.equal(expiredApproval.status, "REJECTED")
      assert.equal(expiredApproval.executionError, "审批请求已过期")
    }

    const audits = await prisma.mcpAuditLog.findMany()
    const serializedAudits = JSON.stringify(audits)
    assert.doesNotMatch(serializedAudits, new RegExp(bodyMarker))
    assert.doesNotMatch(serializedAudits, new RegExp(refreshedA.access_token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    assert.doesNotMatch(serializedAudits, new RegExp(tokenB.refresh_token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    progress("maintenance recovery and audit redaction verified")

    const session = await prisma.session.findFirstOrThrow({ where: { userId: ADMIN_ID } })
    const now = Math.floor(Date.now() / 1000)
    const signedToken = async (claims: Record<string, unknown>) => {
      const result = await auth.api.signJWT({
        body: {
          payload: {
            sub: ADMIN_ID,
            azp: clientB.client_id,
            sid: session.id,
            scope: ALL_SCOPES,
            iat: now,
            exp: now + 900,
            ...claims,
          },
        },
      })
      return result.token
    }
    for (const token of [
      await signedToken({ iss: `${origin}/wrong-issuer`, aud: `${origin}/api/mcp` }),
      await signedToken({ iss: `${origin}/api/oauth`, aud: `${origin}/wrong-audience` }),
      await signedToken({ iss: `${origin}/api/oauth`, aud: `${origin}/api/mcp`, exp: now - 30 }),
      await signedToken({ iss: `${origin}/api/oauth`, aud: `${origin}/api/mcp`, nbf: now + 3600 }),
      mutateSignature(tokenB.access_token),
    ]) {
      await assert.rejects(authContext.authenticateOAuthMcpRequest(oauthRequest(token)))
    }

    await assert.rejects(
      authContext.authenticateOAuthMcpRequest(oauthRequest(
        "qzmcp_v1_00000000-0000-4000-8000-000000000000_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      )),
      /不能用于远程/
    )
    progress("JWT claim and legacy credential rejection verified")

    await credentials.revokeMcpCredential(contextA.credentialId)
    await assert.rejects(
      authContext.authenticateOAuthMcpRequest(oauthRequest(refreshedA.access_token)),
      /无效或已撤销/
    )
    const survivingContext = await authContext.authenticateOAuthMcpRequest(oauthRequest(tokenB.access_token))
    assert.equal(survivingContext.credentialId, contextB.credentialId)
    assert.equal(await prisma.oauthClient.count({ where: { clientId: clientA.client_id } }), 0)
    assert.equal(await prisma.oauthClient.count({ where: { clientId: clientB.client_id } }), 1)

    const revoke = await oauthFetch("/oauth2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        client_id: clientB.client_id,
        token: tokenB.refresh_token,
        token_type_hint: "refresh_token",
      }),
    })
    assert.ok([200, 204].includes(revoke.status), await revoke.text())
    const revokedRefresh = await oauthFetch("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: formBody({
        grant_type: "refresh_token",
        client_id: clientB.client_id,
        refresh_token: tokenB.refresh_token,
        resource: `${origin}/api/mcp`,
      }),
    })
    assert.ok(revokedRefresh.status >= 400)
    progress("Agent and refresh token revocation verified")

    const beforePasswordChange = await prisma.user.findUniqueOrThrow({ where: { id: ADMIN_ID } })
    await authService.changeAdminPassword({
      userId: ADMIN_ID,
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    })
    const [changedUser, changedAccount] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ADMIN_ID } }),
      prisma.account.findUniqueOrThrow({
        where: { providerId_accountId: { providerId: "credential", accountId: ADMIN_ID } },
      }),
    ])
    assert.equal(changedUser.passwordVersion, beforePasswordChange.passwordVersion + 1)
    assert.equal(changedUser.passwordHash, changedAccount.password)
    assert.ok(await bcrypt.compare(NEW_PASSWORD, changedUser.passwordHash))
    assert.equal(await prisma.session.count({ where: { userId: ADMIN_ID } }), 0)
    const agentAfterPasswordChange = await authContext.authenticateOAuthMcpRequest(
      oauthRequest(tokenB.access_token)
    )
    assert.equal(agentAfterPasswordChange.credentialId, contextB.credentialId)
    progress("password migration compatibility and session revocation verified")

    const originalNodeEnv = process.env.NODE_ENV
    const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    Object.assign(process.env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://liaoqizai.site",
    })
    try {
      const invalidHost = await mcpRoute.POST(new nextServer.NextRequest("https://example.invalid/api/mcp", {
        method: "POST",
        headers: { host: "example.invalid", "content-type": "application/json" },
        body: "{}",
      }))
      assert.equal(invalidHost.status, 421)
      assert.equal(oauthConfig.isProductionMcpHost(new Request("https://liaoqizai.site/api/mcp")), true)
    } finally {
      Object.assign(process.env, {
        NODE_ENV: originalNodeEnv,
        NEXT_PUBLIC_SITE_URL: originalSiteUrl,
      })
    }

    progress("OAuth 2.1 MCP integration test passed")
  } finally {
    oauthRouteHandler = null
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeIdleConnections()
      server.closeAllConnections()
    })
    await prisma.$disconnect()
    await pg.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
    await pg.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
