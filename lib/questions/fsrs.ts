import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
  type ReviewLogInput,
  type StepUnit,
} from "ts-fsrs"
import type { QuestionCardState, QuestionRating } from "./domain"

export const QUESTION_FSRS_VERSION = "5.4.1" as const

export interface SerializedFsrsParameters {
  [key: string]: number | boolean | number[] | StepUnit[]
  request_retention: number
  maximum_interval: number
  w: number[]
  enable_fuzz: boolean
  enable_short_term: boolean
  learning_steps: StepUnit[]
  relearning_steps: StepUnit[]
}

export interface SerializedFsrsCard {
  [key: string]: string | number | null
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review: string | null
}

export interface SerializedFsrsReviewLog {
  [key: string]: string | number
  rating: Rating
  state: State
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  review: string
}

export interface QuestionCardFields {
  dueAt: Date
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: QuestionCardState
  lastReviewAt: Date | null
}

export interface QuestionScheduleResult {
  card: Card
  questionFields: QuestionCardFields
  reviewLog: ReviewLog
  beforeCard: SerializedFsrsCard
  afterCard: SerializedFsrsCard
  fsrsReviewLog: SerializedFsrsReviewLog
  stateBefore: QuestionCardState
  rating: QuestionRating
  reviewedAt: Date
  schedulerVersion: typeof QUESTION_FSRS_VERSION
  parametersSnapshot: SerializedFsrsParameters
}

const generatedQuestionParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["10m"],
  relearning_steps: ["10m"],
})

export const QUESTION_FSRS_PARAMETERS: Readonly<FSRSParameters> = Object.freeze({
  ...generatedQuestionParameters,
  w: Object.freeze([...generatedQuestionParameters.w]),
  learning_steps: Object.freeze([...generatedQuestionParameters.learning_steps]),
  relearning_steps: Object.freeze([...generatedQuestionParameters.relearning_steps]),
})

export const QUESTION_FSRS_PARAMETERS_SNAPSHOT: Readonly<SerializedFsrsParameters> = Object.freeze({
  request_retention: QUESTION_FSRS_PARAMETERS.request_retention,
  maximum_interval: QUESTION_FSRS_PARAMETERS.maximum_interval,
  w: Object.freeze([...QUESTION_FSRS_PARAMETERS.w]) as unknown as number[],
  enable_fuzz: QUESTION_FSRS_PARAMETERS.enable_fuzz,
  enable_short_term: QUESTION_FSRS_PARAMETERS.enable_short_term,
  learning_steps: Object.freeze([...QUESTION_FSRS_PARAMETERS.learning_steps]) as unknown as StepUnit[],
  relearning_steps: Object.freeze([...QUESTION_FSRS_PARAMETERS.relearning_steps]) as unknown as StepUnit[],
})

function cloneDate(value: Date): Date {
  return new Date(value.getTime())
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new TypeError(`${field} must be an ISO date string`)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError(`${field} must be a canonical ISO date string`)
  }
  return date
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function expectFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`)
  }
  return value
}

function expectNonNegativeInteger(value: unknown, field: string): number {
  const number = expectFiniteNumber(value, field)
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${field} must be a non-negative integer`)
  }
  return number
}

function expectState(value: unknown, field: string): State {
  if (value === State.New || value === State.Learning || value === State.Review || value === State.Relearning) {
    return value
  }
  throw new TypeError(`${field} is not a supported FSRS state`)
}

function expectGrade(value: unknown, field: string): Grade {
  if (value === Rating.Again || value === Rating.Hard || value === Rating.Good || value === Rating.Easy) {
    return value
  }
  throw new TypeError(`${field} is not a supported FSRS grade`)
}

function expectStepArray(value: unknown, field: string): StepUnit[] {
  if (!Array.isArray(value) || !value.every((step) => typeof step === "string" && /^\d+(?:\.\d+)?[mhd]$/.test(step))) {
    throw new TypeError(`${field} must contain valid FSRS step units`)
  }
  return [...value] as StepUnit[]
}

export function questionRatingToFsrs(rating: QuestionRating): Grade {
  switch (rating) {
    case "AGAIN": return Rating.Again
    case "HARD": return Rating.Hard
    case "GOOD": return Rating.Good
    case "EASY": return Rating.Easy
  }
}

export function fsrsRatingToQuestionRating(rating: Rating): QuestionRating {
  switch (rating) {
    case Rating.Again: return "AGAIN"
    case Rating.Hard: return "HARD"
    case Rating.Good: return "GOOD"
    case Rating.Easy: return "EASY"
    default: throw new TypeError("Manual is not a valid question review rating")
  }
}

export function questionStateToFsrs(state: QuestionCardState): State {
  switch (state) {
    case "NEW": return State.New
    case "LEARNING": return State.Learning
    case "REVIEW": return State.Review
    case "RELEARNING": return State.Relearning
  }
}

export function fsrsStateToQuestionState(state: State): QuestionCardState {
  switch (state) {
    case State.New: return "NEW"
    case State.Learning: return "LEARNING"
    case State.Review: return "REVIEW"
    case State.Relearning: return "RELEARNING"
  }
}

export function serializeFsrsParameters(parameters: FSRSParameters): SerializedFsrsParameters {
  return {
    request_retention: parameters.request_retention,
    maximum_interval: parameters.maximum_interval,
    w: [...parameters.w],
    enable_fuzz: parameters.enable_fuzz,
    enable_short_term: parameters.enable_short_term,
    learning_steps: [...parameters.learning_steps],
    relearning_steps: [...parameters.relearning_steps],
  }
}

export function deserializeFsrsParameters(value: unknown): FSRSParameters {
  const record = expectRecord(value, "parametersSnapshot")
  const requestRetention = expectFiniteNumber(record.request_retention, "request_retention")
  const maximumInterval = expectNonNegativeInteger(record.maximum_interval, "maximum_interval")
  if (!(requestRetention > 0 && requestRetention <= 1)) {
    throw new TypeError("request_retention must be in the range (0, 1]")
  }
  if (maximumInterval < 1) throw new TypeError("maximum_interval must be at least 1")
  if (!Array.isArray(record.w) || !record.w.every((weight) => typeof weight === "number" && Number.isFinite(weight))) {
    throw new TypeError("w must contain finite numbers")
  }
  if (typeof record.enable_fuzz !== "boolean" || typeof record.enable_short_term !== "boolean") {
    throw new TypeError("FSRS enable flags must be boolean")
  }
  return {
    request_retention: requestRetention,
    maximum_interval: maximumInterval,
    w: [...record.w],
    enable_fuzz: record.enable_fuzz,
    enable_short_term: record.enable_short_term,
    learning_steps: expectStepArray(record.learning_steps, "learning_steps"),
    relearning_steps: expectStepArray(record.relearning_steps, "relearning_steps"),
  }
}

export function createQuestionScheduler(parameters: FSRSParameters = QUESTION_FSRS_PARAMETERS): ReturnType<typeof fsrs> {
  return fsrs(parameters)
}

export function createEmptyFsrsCard(now: Date): Card {
  return createEmptyCard(cloneDate(now))
}

export function createNewQuestionCard(now: Date): QuestionCardFields {
  return fsrsCardToQuestionFields(createEmptyFsrsCard(now))
}

export function questionFieldsToFsrsCard(fields: QuestionCardFields): Card {
  return {
    due: cloneDate(fields.dueAt),
    stability: fields.stability,
    difficulty: fields.difficulty,
    elapsed_days: fields.elapsedDays,
    scheduled_days: fields.scheduledDays,
    learning_steps: fields.learningSteps,
    reps: fields.reps,
    lapses: fields.lapses,
    state: questionStateToFsrs(fields.state),
    last_review: fields.lastReviewAt ? cloneDate(fields.lastReviewAt) : undefined,
  }
}

export function fsrsCardToQuestionFields(card: Card): QuestionCardFields {
  return {
    dueAt: cloneDate(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: fsrsStateToQuestionState(card.state),
    lastReviewAt: card.last_review ? cloneDate(card.last_review) : null,
  }
}

function toFsrsCard(card: Card | QuestionCardFields): Card {
  return "dueAt" in card ? questionFieldsToFsrsCard(card) : deserializeFsrsCard(serializeFsrsCard(card))
}

export function serializeFsrsCard(card: Card | QuestionCardFields): SerializedFsrsCard {
  const fsrsCard = "dueAt" in card ? questionFieldsToFsrsCard(card) : card
  return {
    due: fsrsCard.due.toISOString(),
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    elapsed_days: fsrsCard.elapsed_days,
    scheduled_days: fsrsCard.scheduled_days,
    learning_steps: fsrsCard.learning_steps,
    reps: fsrsCard.reps,
    lapses: fsrsCard.lapses,
    state: fsrsCard.state,
    last_review: fsrsCard.last_review?.toISOString() ?? null,
  }
}

export function deserializeFsrsCard(value: unknown): Card {
  const record = expectRecord(value, "card")
  const lastReview = record.last_review === null
    ? undefined
    : parseIsoDate(record.last_review, "last_review")
  return {
    due: parseIsoDate(record.due, "due"),
    stability: expectFiniteNumber(record.stability, "stability"),
    difficulty: expectFiniteNumber(record.difficulty, "difficulty"),
    elapsed_days: expectNonNegativeInteger(record.elapsed_days, "elapsed_days"),
    scheduled_days: expectNonNegativeInteger(record.scheduled_days, "scheduled_days"),
    learning_steps: expectNonNegativeInteger(record.learning_steps, "learning_steps"),
    reps: expectNonNegativeInteger(record.reps, "reps"),
    lapses: expectNonNegativeInteger(record.lapses, "lapses"),
    state: expectState(record.state, "state"),
    last_review: lastReview,
  }
}

export function serializeFsrsReviewLog(log: ReviewLog): SerializedFsrsReviewLog {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.toISOString(),
  }
}

export function deserializeFsrsReviewLog(value: unknown): ReviewLog {
  const record = expectRecord(value, "reviewLog")
  return {
    rating: expectGrade(record.rating, "rating"),
    state: expectState(record.state, "state"),
    due: parseIsoDate(record.due, "due"),
    stability: expectFiniteNumber(record.stability, "stability"),
    difficulty: expectFiniteNumber(record.difficulty, "difficulty"),
    elapsed_days: expectNonNegativeInteger(record.elapsed_days, "elapsed_days"),
    last_elapsed_days: expectNonNegativeInteger(record.last_elapsed_days, "last_elapsed_days"),
    scheduled_days: expectNonNegativeInteger(record.scheduled_days, "scheduled_days"),
    learning_steps: expectNonNegativeInteger(record.learning_steps, "learning_steps"),
    review: parseIsoDate(record.review, "review"),
  }
}

function buildScheduleResult(
  beforeCard: Card,
  rating: QuestionRating,
  reviewedAt: Date,
  parameters: FSRSParameters
): QuestionScheduleResult {
  const scheduler = createQuestionScheduler(parameters)
  const result = scheduler.next(beforeCard, reviewedAt, questionRatingToFsrs(rating))
  return {
    card: result.card,
    questionFields: fsrsCardToQuestionFields(result.card),
    reviewLog: result.log,
    beforeCard: serializeFsrsCard(beforeCard),
    afterCard: serializeFsrsCard(result.card),
    fsrsReviewLog: serializeFsrsReviewLog(result.log),
    stateBefore: fsrsStateToQuestionState(beforeCard.state),
    rating,
    reviewedAt: cloneDate(reviewedAt),
    schedulerVersion: QUESTION_FSRS_VERSION,
    parametersSnapshot: serializeFsrsParameters(parameters),
  }
}

export function scheduleQuestionCard(
  card: Card | QuestionCardFields,
  rating: QuestionRating,
  reviewedAt: Date,
  parameters: FSRSParameters = QUESTION_FSRS_PARAMETERS
): QuestionScheduleResult {
  return buildScheduleResult(toFsrsCard(card), rating, cloneDate(reviewedAt), parameters)
}

export function reviseQuestionCard(
  currentCard: Card | QuestionCardFields,
  storedReviewLog: SerializedFsrsReviewLog | ReviewLogInput,
  newRating: QuestionRating,
  parametersSnapshot: SerializedFsrsParameters | FSRSParameters = QUESTION_FSRS_PARAMETERS
): QuestionScheduleResult {
  const parameters = deserializeFsrsParameters(serializeFsrsParameters(parametersSnapshot as FSRSParameters))
  const reviewLog = typeof storedReviewLog.review === "string"
    ? deserializeFsrsReviewLog(storedReviewLog)
    : storedReviewLog
  const scheduler = createQuestionScheduler(parameters)
  const beforeCard = scheduler.rollback(toFsrsCard(currentCard), reviewLog)
  const reviewedAt = reviewLog.review instanceof Date
    ? cloneDate(reviewLog.review)
    : new Date(reviewLog.review)
  return buildScheduleResult(beforeCard, newRating, reviewedAt, parameters)
}

export function fsrsCardsEqual(
  left: Card | QuestionCardFields | SerializedFsrsCard,
  right: Card | QuestionCardFields | SerializedFsrsCard
): boolean {
  const normalize = (value: Card | QuestionCardFields | SerializedFsrsCard) => {
    // PostgreSQL JSONB does not preserve object key order. Re-serialize stored
    // snapshots into the canonical field order before comparing them.
    if ("due" in value && typeof value.due === "string") {
      return serializeFsrsCard(deserializeFsrsCard(value))
    }
    return serializeFsrsCard(value as Card | QuestionCardFields)
  }
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

export function assertFsrsCardMatchesSnapshot(
  currentCard: Card | QuestionCardFields,
  expectedAfterCard: SerializedFsrsCard
): void {
  if (!fsrsCardsEqual(currentCard, expectedAfterCard)) {
    throw new Error("Current Card no longer matches the review log afterCard snapshot")
  }
}
