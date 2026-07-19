import { NextResponse } from "next/server"
import { AppError } from "@/lib/errors"

export function handleApiError(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.statusCode }
    )
  }
  console.error("[UnexpectedError]", e)
  return NextResponse.json(
    { error: "服务器内部错误", code: "INTERNAL_ERROR" },
    { status: 500 }
  )
}
