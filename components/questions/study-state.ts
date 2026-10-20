import type { TodayQuestion, RevealResponse, QuestionRating } from "./types"

export type CurrentReview = {
  question: TodayQuestion
  answerMarkdown: string
  revealed: RevealResponse | null
  directReveal: boolean
  rating: QuestionRating | null
  reviewRevision: number | null
}

export type CompletedReview = {
  key: string
  promptMarkdown: string
  answerMarkdown: string
  revealed: RevealResponse
  directReveal: boolean
  rating: QuestionRating
}

// Pure projections only. Requests, revision guards and focus remain in QuestionStudy.
export function revealReview(current: CurrentReview, response: RevealResponse): CurrentReview {
  const directReveal = response.directReveal ?? !current.answerMarkdown.trim()
  return {
    ...current,
    revealed: response,
    directReveal,
    rating: directReveal ? response.rating ?? "AGAIN" : null,
    reviewRevision: directReveal ? response.reviewRevision ?? null : null,
  }
}

export function ratingRequest(current: CurrentReview, rating: QuestionRating) {
  return current.reviewRevision === null
    ? {
        operation: "CREATE" as const,
        answerMarkdown: current.answerMarkdown,
        rating,
        expectedContentVersion: current.question.contentVersion,
        expectedScheduleVersion: current.question.scheduleVersion,
      }
    : {
        operation: "REVISE" as const,
        rating,
        expectedReviewRevision: current.reviewRevision,
      }
}

export function reviewSnapshot(current: CurrentReview, revealed: RevealResponse, rating: QuestionRating): CompletedReview {
  return {
    key: current.question.reviewKey,
    promptMarkdown: current.question.promptMarkdown,
    answerMarkdown: current.answerMarkdown,
    revealed,
    directReveal: current.directReveal,
    rating,
  }
}
