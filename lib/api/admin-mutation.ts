import { NextRequest } from "next/server"
import { validateOrigin } from "@/lib/csrf"
import { PermissionError, ValidationError } from "@/lib/errors"

export function requireAdminMutationOrigin(request: NextRequest) {
  if (!validateOrigin(request, { requireOrigin: true })) {
    throw new PermissionError("请求来源无效")
  }
}

export function requireJsonRequest(request: NextRequest) {
  requireAdminMutationOrigin(request)
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (contentType !== "application/json") {
    throw new ValidationError("请求必须使用 application/json")
  }
}
