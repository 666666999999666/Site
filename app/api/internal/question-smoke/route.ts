import { NextRequest, NextResponse } from "next/server"
import {
  createQuestionSmokeDependencies,
  isQuestionSmokeRequest,
  QuestionSmokeError,
  runQuestionSmoke,
} from "@/lib/questions/internal-smoke"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!isQuestionSmokeRequest(request)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const result = await runQuestionSmoke(await createQuestionSmokeDependencies())
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const stage = error instanceof QuestionSmokeError ? error.stage : "internal"
    console.error(`[Question smoke failure] stage=${stage}`)
    return NextResponse.json(
      { error: "question_smoke_failed", stage },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
