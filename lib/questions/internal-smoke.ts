import { randomBytes, randomUUID } from "node:crypto"
import { splitSetCookieHeader } from "better-auth/cookies"
import { isDirectLoopbackRequest } from "@/lib/mcp/internal-request"

const INTERNAL_ORIGIN = "http://127.0.0.1:3000"
const REQUEST_TIMEOUT_MS = 15_000

export type QuestionSmokeStage =
  | "identity"
  | "session"
  | "create"
  | "start"
  | "start_privacy"
  | "reveal"
  | "rating"
  | "cleanup"
  | "cleanup_after_failure"
  | "internal"

export class QuestionSmokeError extends Error {
  readonly stage: QuestionSmokeStage

  constructor(stage: QuestionSmokeStage) {
    super(`Question smoke failed at ${stage}`)
    this.name = "QuestionSmokeError"
    this.stage = stage
  }
}

interface SmokeIdentity {
  userId: string
  email: string
  password: string
}

interface SmokeSession {
  cookie: string
  origin: string
}

export interface QuestionSmokeDependencies {
  createIdentity(): Promise<SmokeIdentity>
  createSession(identity: SmokeIdentity): Promise<SmokeSession>
  request(path: string, init: RequestInit): Promise<Response>
  cleanup(userId: string): Promise<void>
}

interface JsonObject {
  [key: string]: unknown
}

function fail(stage: QuestionSmokeStage): never {
  throw new QuestionSmokeError(stage)
}

function asObject(value: unknown, stage: QuestionSmokeStage): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(stage)
  return value as JsonObject
}

async function readJson(response: Response, stage: QuestionSmokeStage): Promise<JsonObject> {
  if (!response.ok) fail(stage)
  try {
    return asObject(await response.json(), stage)
  } catch (error) {
    if (error instanceof QuestionSmokeError) throw error
    return fail(stage)
  }
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key))
  if (typeof value !== "object" || value === null) return false
  return Object.entries(value).some(
    ([nestedKey, nestedValue]) => nestedKey === key || containsKey(nestedValue, key)
  )
}

function jsonHeaders(cookie: string, origin: string): HeadersInit {
  return {
    "content-type": "application/json",
    cookie,
    origin,
  }
}

function jsonRequest(method: "POST" | "PUT", cookie: string, origin: string, body: unknown) {
  return {
    method,
    headers: jsonHeaders(cookie, origin),
    body: JSON.stringify(body),
    redirect: "manual" as const,
  }
}

function normalizeError(error: unknown): QuestionSmokeError {
  return error instanceof QuestionSmokeError ? error : new QuestionSmokeError("internal")
}

export function isQuestionSmokeRequest(request: Pick<Request, "headers">): boolean {
  if (request.headers.has("forwarded")) return false
  return isDirectLoopbackRequest(request)
}

export async function runQuestionSmoke(
  dependencies: QuestionSmokeDependencies
): Promise<{ ok: true; flow: "typed-good"; cleaned: true }> {
  const referenceAnswer = `smoke-reference-${randomUUID()}`
  const typedAnswer = `smoke-typed-${randomUUID()}`
  const prompt = `Question smoke ${randomUUID()}`
  let identity: SmokeIdentity | null = null
  let runError: QuestionSmokeError | null = null

  try {
    identity = await dependencies.createIdentity()
    const session = await dependencies.createSession(identity)

    const created = await readJson(await dependencies.request(
      "/api/questions",
      jsonRequest("POST", session.cookie, session.origin, {
        promptMarkdown: prompt,
        referenceAnswerMarkdown: referenceAnswer,
      })
    ), "create")
    if (typeof created.id !== "string") fail("create")

    const started = await readJson(await dependencies.request(
      "/api/questions/today/start",
      jsonRequest("POST", session.cookie, session.origin, {})
    ), "start")
    const question = asObject(started.question, "start")
    const reviewKey = question.reviewKey
    const contentVersion = question.contentVersion
    const scheduleVersion = question.scheduleVersion
    if (
      started.state !== "READY"
      || question.id !== created.id
      || typeof reviewKey !== "string"
      || typeof contentVersion !== "number"
      || typeof scheduleVersion !== "number"
    ) {
      fail("start")
    }
    if (
      containsKey(started, "referenceAnswerMarkdown")
      || JSON.stringify(started).includes(referenceAnswer)
    ) {
      fail("start_privacy")
    }

    const revealed = await readJson(await dependencies.request(
      `/api/questions/reviews/${encodeURIComponent(reviewKey)}/reveal`,
      jsonRequest("POST", session.cookie, session.origin, {
        answerMarkdown: typedAnswer,
        expectedContentVersion: contentVersion,
        expectedScheduleVersion: scheduleVersion,
      })
    ), "reveal")
    if (revealed.referenceAnswerMarkdown !== referenceAnswer || revealed.directReveal !== false) {
      fail("reveal")
    }

    const rated = await readJson(await dependencies.request(
      `/api/questions/reviews/${encodeURIComponent(reviewKey)}/rating`,
      jsonRequest("PUT", session.cookie, session.origin, {
        operation: "CREATE",
        answerMarkdown: typedAnswer,
        rating: "GOOD",
        expectedContentVersion: contentVersion,
        expectedScheduleVersion: scheduleVersion,
      })
    ), "rating")
    if (rated.rating !== "GOOD") fail("rating")
  } catch (error) {
    runError = normalizeError(error)
  }

  if (identity) {
    try {
      await dependencies.cleanup(identity.userId)
    } catch {
      throw new QuestionSmokeError(runError ? "cleanup_after_failure" : "cleanup")
    }
  }

  if (runError) throw runError
  if (!identity) throw new QuestionSmokeError("identity")
  return { ok: true, flow: "typed-good", cleaned: true }
}

function cookieHeader(response: Response): string {
  const header = response.headers.get("set-cookie")
  if (!header) fail("session")
  const cookies = splitSetCookieHeader(header)
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
  if (cookies.length === 0) fail("session")
  return cookies.join("; ")
}

export async function createQuestionSmokeDependencies(): Promise<QuestionSmokeDependencies> {
  const [databaseModule, authModule, passwordModule, oauthModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/auth/better-auth"),
    import("@/lib/auth/password"),
    import("@/lib/auth/oauth-config"),
  ])
  const { prisma } = databaseModule
  const { auth } = authModule
  const { hashPassword } = passwordModule
  const { oauthSiteOrigin } = oauthModule
  const siteOrigin = oauthSiteOrigin()
  const siteHost = new URL(siteOrigin).host

  return {
    async createIdentity() {
      const suffix = randomUUID()
      const userId = randomUUID()
      const password = randomBytes(32).toString("base64url")
      const passwordHash = await hashPassword(password)
      const email = `question-smoke-${suffix}@example.invalid`
      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.user.create({
            data: {
              id: userId,
              username: `question-smoke-${suffix}`,
              passwordHash,
              name: "Question Smoke",
              email,
            },
          })
          await transaction.account.create({
            data: {
              accountId: userId,
              providerId: "credential",
              userId,
              password: passwordHash,
            },
          })
        })
      } catch {
        fail("identity")
      }
      return { userId, email, password }
    },

    async createSession(identity) {
      let response: Response
      try {
        response = await auth.api.signInEmail({
          body: {
            email: identity.email,
            password: identity.password,
            rememberMe: false,
          },
          headers: new Headers({
            host: siteHost,
            origin: siteOrigin,
            "user-agent": "qz-question-smoke",
            "x-forwarded-for": "127.0.0.1",
          }),
          asResponse: true,
        })
      } catch {
        return fail("session")
      }
      if (!response.ok) fail("session")
      const cookie = cookieHeader(response)
      const session = await prisma.session.findFirst({
        where: { userId: identity.userId },
        select: { id: true },
      })
      if (!session) fail("session")
      return { cookie, origin: siteOrigin }
    },

    request(path, init) {
      return fetch(new URL(path, INTERNAL_ORIGIN), {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    },

    async cleanup(userId) {
      await prisma.$transaction(async (transaction) => {
        await transaction.questionImageReference.deleteMany({ where: { ownerId: userId } })
        await transaction.questionAttempt.deleteMany({ where: { ownerId: userId } })
        await transaction.questionReviewLog.deleteMany({ where: { ownerId: userId } })
        await transaction.questionReviewTicket.updateMany({
          where: { ownerId: userId },
          data: { successorTicketId: null },
        })
        await transaction.questionReviewTicket.deleteMany({ where: { ownerId: userId } })
        await transaction.questionScheduleResetLog.deleteMany({ where: { ownerId: userId } })
        await transaction.question.deleteMany({ where: { ownerId: userId } })
        await transaction.questionPreference.deleteMany({ where: { userId } })
        await transaction.questionImage.deleteMany({ where: { ownerId: userId } })
        await transaction.oauthAccessToken.deleteMany({ where: { userId } })
        await transaction.oauthRefreshToken.deleteMany({ where: { userId } })
        await transaction.oauthConsent.deleteMany({ where: { userId } })
        await transaction.session.deleteMany({ where: { userId } })
        await transaction.account.deleteMany({ where: { userId } })
        await transaction.user.deleteMany({ where: { id: userId } })
      })
    },
  }
}
