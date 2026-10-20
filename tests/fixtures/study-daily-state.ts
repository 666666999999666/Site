import type { DailyDashboardView } from "../../lib/daily"
import type { TodayTransitionResponse } from "../../components/questions/types"

export const dailyDashboard: DailyDashboardView = {
  day: {
    date: "2026-10-20",
    quote: { id: 1, quote: "Focus fixture", category: "Focus", author: null, source: null, sourceDetail: null },
    tasks: ([1, 2, 3] as const).map((slot) => ({ id: null, slot, title: "", completed: false, completedAt: null, sourceTodoId: null })),
    completedCount: 0, progress: 0,
  },
  stats: { streak: 0, month: "2026-10", recordedDays: 0, completedDays: 0, averageProgress: 0 },
  todoOptions: [{ id: "todo-1", title: "Source task", category: null }],
}

export const studyTransition: TodayTransitionResponse = {
  state: "READY",
  preferences: { dailyNewLimit: 10 },
  summary: { dueOldCount: 1, newIntroducedToday: 0, newRemaining: 10, totalActions: 0, uniqueQuestions: 0, typedCount: 0, directRevealCount: 0, ratings: { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 } },
  question: { id: "q1", reviewKey: "review-1", promptMarkdown: "Question one", contentVersion: 2, scheduleVersion: 3 },
}
