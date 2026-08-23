import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { Rating, State } from "ts-fsrs"
import {
  QUESTION_DEFAULT_DAILY_NEW_LIMIT,
  QUESTION_MAX_DAILY_NEW_LIMIT,
  QUESTION_MIN_DAILY_NEW_LIMIT,
  assertQuestionDailyNewLimit,
  createAnswerDigest,
  createQuestionTicketExpiry,
  determineRevealMode,
  getQuestionReviewDate,
  getQuestionShanghaiDayBounds,
  getRemainingQuestionNewLimit,
  normalizeReferenceAnswer,
} from "../lib/questions/domain"
import {
  QUESTION_FSRS_PARAMETERS,
  QUESTION_FSRS_PARAMETERS_SNAPSHOT,
  QUESTION_FSRS_VERSION,
  assertFsrsCardMatchesSnapshot,
  createNewQuestionCard,
  deserializeFsrsCard,
  deserializeFsrsParameters,
  deserializeFsrsReviewLog,
  fsrsCardsEqual,
  questionFieldsToFsrsCard,
  reviseQuestionCard,
  scheduleQuestionCard,
  serializeFsrsCard,
  serializeFsrsParameters,
  serializeFsrsReviewLog,
} from "../lib/questions/fsrs"

const REVIEWED_AT = new Date("2026-08-23T01:02:03.000Z")

test("question scheduler pins ts-fsrs 5.4.1 parameters and snapshots the completed object", () => {
  assert.equal(QUESTION_FSRS_VERSION, "5.4.1")
  assert.equal(QUESTION_FSRS_PARAMETERS.request_retention, 0.9)
  assert.equal(QUESTION_FSRS_PARAMETERS.maximum_interval, 365)
  assert.equal(QUESTION_FSRS_PARAMETERS.enable_fuzz, false)
  assert.equal(QUESTION_FSRS_PARAMETERS.enable_short_term, true)
  assert.deepEqual(QUESTION_FSRS_PARAMETERS.learning_steps, ["10m"])
  assert.deepEqual(QUESTION_FSRS_PARAMETERS.relearning_steps, ["10m"])
  assert.ok(QUESTION_FSRS_PARAMETERS.w.length > 0, "the default FSRS weights must be persisted")
  assert.deepEqual(
    QUESTION_FSRS_PARAMETERS_SNAPSHOT,
    serializeFsrsParameters(QUESTION_FSRS_PARAMETERS)
  )
  assert.deepEqual(
    serializeFsrsParameters(deserializeFsrsParameters(QUESTION_FSRS_PARAMETERS_SNAPSHOT)),
    QUESTION_FSRS_PARAMETERS_SNAPSHOT
  )
})

test("empty Card mapping and JSON serialization preserve every ts-fsrs 5.4.1 Card field", () => {
  const fields = createNewQuestionCard(REVIEWED_AT)
  assert.deepEqual(fields, {
    dueAt: REVIEWED_AT,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: "NEW",
    lastReviewAt: null,
  })

  const serialized = serializeFsrsCard(questionFieldsToFsrsCard(fields))
  assert.deepEqual(Object.keys(serialized).sort(), [
    "difficulty",
    "due",
    "elapsed_days",
    "lapses",
    "last_review",
    "learning_steps",
    "reps",
    "scheduled_days",
    "stability",
    "state",
  ])
  assert.equal(serialized.state, State.New)
  assert.equal(serialized.last_review, null)
  assert.ok(fsrsCardsEqual(deserializeFsrsCard(serialized), fields))
})

test("single 10 minute learning step delegates all four New ratings to ts-fsrs", () => {
  const newCard = createNewQuestionCard(REVIEWED_AT)
  const again = scheduleQuestionCard(newCard, "AGAIN", REVIEWED_AT)
  const hard = scheduleQuestionCard(newCard, "HARD", REVIEWED_AT)
  const good = scheduleQuestionCard(newCard, "GOOD", REVIEWED_AT)
  const easy = scheduleQuestionCard(newCard, "EASY", REVIEWED_AT)

  assert.equal(again.questionFields.state, "LEARNING")
  assert.equal(again.questionFields.dueAt.getTime() - REVIEWED_AT.getTime(), 10 * 60 * 1000)
  assert.equal(hard.questionFields.state, "LEARNING")
  assert.equal(hard.questionFields.dueAt.getTime() - REVIEWED_AT.getTime(), 15 * 60 * 1000)
  assert.equal(good.questionFields.state, "REVIEW")
  assert.ok(good.questionFields.scheduledDays >= 1)
  assert.equal(easy.questionFields.state, "REVIEW")
  assert.ok(easy.questionFields.scheduledDays >= good.questionFields.scheduledDays)
})

test("Review Again enters the configured 10 minute relearning step", () => {
  const first = scheduleQuestionCard(createNewQuestionCard(REVIEWED_AT), "GOOD", REVIEWED_AT)
  const reviewAt = first.questionFields.dueAt
  const forgotten = scheduleQuestionCard(first.questionFields, "AGAIN", reviewAt)

  assert.equal(forgotten.stateBefore, "REVIEW")
  assert.equal(forgotten.questionFields.state, "RELEARNING")
  assert.equal(forgotten.questionFields.dueAt.getTime() - reviewAt.getTime(), 10 * 60 * 1000)
})

test("ReviewLog serialization retains rollback metadata including last_elapsed_days", () => {
  const result = scheduleQuestionCard(createNewQuestionCard(REVIEWED_AT), "GOOD", REVIEWED_AT)
  const serialized = serializeFsrsReviewLog(result.reviewLog)

  assert.deepEqual(Object.keys(serialized).sort(), [
    "difficulty",
    "due",
    "elapsed_days",
    "last_elapsed_days",
    "learning_steps",
    "rating",
    "review",
    "scheduled_days",
    "stability",
    "state",
  ])
  assert.equal(serialized.rating, Rating.Good)
  assert.equal(serialized.review, REVIEWED_AT.toISOString())
  assert.ok(Object.hasOwn(serialized, "last_elapsed_days"))
  assert.deepEqual(serializeFsrsReviewLog(deserializeFsrsReviewLog(serialized)), serialized)
})

test("rating revision rolls back the last Card and recomputes at the original reviewedAt", () => {
  const before = createNewQuestionCard(REVIEWED_AT)
  const original = scheduleQuestionCard(before, "GOOD", REVIEWED_AT)
  const revised = reviseQuestionCard(
    original.questionFields,
    original.fsrsReviewLog,
    "HARD",
    original.parametersSnapshot
  )
  const directHard = scheduleQuestionCard(
    before,
    "HARD",
    REVIEWED_AT,
    deserializeFsrsParameters(original.parametersSnapshot)
  )

  assert.equal(revised.reviewedAt.toISOString(), REVIEWED_AT.toISOString())
  assert.equal(revised.fsrsReviewLog.review, REVIEWED_AT.toISOString())
  assert.ok(fsrsCardsEqual(revised.card, directHard.card))
  assert.deepEqual(revised.parametersSnapshot, original.parametersSnapshot)
  assert.doesNotThrow(() => assertFsrsCardMatchesSnapshot(original.card, original.afterCard))
  assert.throws(
    () => assertFsrsCardMatchesSnapshot(revised.card, original.afterCard),
    /no longer matches/
  )
})

test("FSRS card comparison ignores PostgreSQL JSONB key order", () => {
  const card = serializeFsrsCard(createNewQuestionCard(REVIEWED_AT))
  const reordered = Object.fromEntries(Object.entries(card).reverse()) as typeof card

  assert.ok(fsrsCardsEqual(card, reordered))
})

test("question domain derives direct reveal, ticket expiry, quota, digest and Shanghai dates", () => {
  assert.equal(normalizeReferenceAnswer(" \n\t "), null)
  assert.equal(normalizeReferenceAnswer("  answer  "), "  answer  ")
  assert.equal(determineRevealMode("\n\t"), "DIRECT_REVEAL")
  assert.equal(determineRevealMode("答案"), "TYPED")
  assert.equal(
    createAnswerDigest("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  )
  assert.equal(
    createQuestionTicketExpiry(REVIEWED_AT).getTime() - REVIEWED_AT.getTime(),
    2 * 60 * 60 * 1000
  )
  assert.equal(QUESTION_DEFAULT_DAILY_NEW_LIMIT, 10)
  assert.equal(assertQuestionDailyNewLimit(QUESTION_MIN_DAILY_NEW_LIMIT), 1)
  assert.equal(assertQuestionDailyNewLimit(QUESTION_MAX_DAILY_NEW_LIMIT), 100)
  assert.throws(() => assertQuestionDailyNewLimit(0), /dailyNewLimit/)
  assert.equal(getRemainingQuestionNewLimit(3, 5), 0)

  assert.equal(
    getQuestionReviewDate(new Date("2026-08-22T15:59:59.999Z")).toISOString(),
    "2026-08-22T00:00:00.000Z"
  )
  assert.equal(
    getQuestionReviewDate(new Date("2026-08-22T16:00:00.000Z")).toISOString(),
    "2026-08-23T00:00:00.000Z"
  )
  assert.deepEqual(
    Object.values(getQuestionShanghaiDayBounds(new Date("2026-08-22T16:00:00.000Z")))
      .map((date) => date.toISOString()),
    ["2026-08-22T16:00:00.000Z", "2026-08-23T16:00:00.000Z"]
  )
})

test("question migration carries compound ownership, state and partial uniqueness constraints", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260823010000_question_school/migration.sql",
      import.meta.url
    ),
    "utf8"
  )

  assert.match(migration, /QuestionReviewTicket_one_active_per_owner/)
  assert.match(migration, /WHERE "cancelledAt" IS NULL AND "consumedAt" IS NULL/)
  assert.match(migration, /QuestionReviewLog_one_unadvanced_per_owner/)
  assert.match(migration, /WHERE "advancedAt" IS NULL/)
  assert.match(migration, /QuestionReviewLog_reviewKey_questionId_ownerId_fkey/)
  assert.match(migration, /QuestionAttempt_reviewLogId_questionId_ownerId_fkey/)
  assert.match(migration, /QuestionImageReference_imageId_ownerId_fkey/)
  assert.match(migration, /QuestionPreference_dailyNewLimit_check/)
  assert.match(migration, /QuestionReviewLog_direct_reveal_check/)
  assert.match(migration, /"schedulerVersion" = '5\.4\.1'/)
})

test("package manifests pin ts-fsrs without a range", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>
  }
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
    packages: Record<string, { version?: string; dependencies?: Record<string, string> }>
  }

  assert.equal(packageJson.dependencies["ts-fsrs"], "5.4.1")
  assert.equal(packageLock.packages[""].dependencies?.["ts-fsrs"], "5.4.1")
  assert.equal(packageLock.packages["node_modules/ts-fsrs"].version, "5.4.1")
})
