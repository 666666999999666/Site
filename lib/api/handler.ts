import { NextResponse } from "next/server"
import { AppError } from "@/lib/errors"
import { Prisma } from "@/lib/generated/prisma/client"

export function handleApiError(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.statusCode }
    )
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") {
      return NextResponse.json(
        { error: "资源不存在", code: "NOT_FOUND" },
        { status: 404 }
      )
    }
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "数据已存在，请勿重复提交", code: "CONFLICT" },
        { status: 409 }
      )
    }
    if (e.code === "P2003") {
      return NextResponse.json(
        { error: "关联数据无效", code: "INVALID_RELATION" },
        { status: 400 }
      )
    }
  }

  if (e instanceof Prisma.PrismaClientInitializationError) {
    console.error("[DatabaseUnavailable]", e.message)
    return NextResponse.json(
      { error: "数据库暂时不可用", code: "DATABASE_UNAVAILABLE" },
      { status: 503 }
    )
  }

  if (e instanceof SyntaxError) {
    return NextResponse.json(
      { error: "请求体必须是有效 JSON", code: "INVALID_JSON" },
      { status: 400 }
    )
  }

  console.error("[UnexpectedError]", e)
  return NextResponse.json(
    { error: "服务器内部错误", code: "INTERNAL_ERROR" },
    { status: 500 }
  )
}
