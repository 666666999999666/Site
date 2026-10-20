"use client"

import { useState } from "react"
import { DailyTopThree } from "@/components/admin/DailyTopThree"
import { QuestionStudy } from "@/components/questions/QuestionStudy"
import { dailyDashboard } from "@/tests/fixtures/study-daily-state"

export default function StudyDailyStateHarness() {
  const [mode, setMode] = useState<"daily" | "study" | null>(null)
  return <main className="mx-auto max-w-6xl p-6">
    <nav aria-label="Harness controls" className="mb-6 flex gap-6">
      <button onClick={() => setMode("daily")}>Show Daily</button>
      <button onClick={() => setMode("study")}>Show Study</button>
      <button onClick={() => setMode(null)}>Unmount</button>
    </nav>
    {mode === "daily" && <DailyTopThree initialDashboard={dailyDashboard} />}
    {mode === "study" && <QuestionStudy />}
  </main>
}
