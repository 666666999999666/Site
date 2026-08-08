import { NextRequest, NextResponse } from "next/server"
import { AuthError, ValidationError } from "../errors"

export function mcpBearerCredential(request: NextRequest): string {
  const authorization = request.headers.get("authorization")
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")
  if (!match) throw new AuthError("缺少 MCP Bearer credential")
  return match[1]
}

export function mcpUploadToken(request: NextRequest): string {
  const token = request.headers.get("x-mcp-upload-token")?.trim()
  if (!token) throw new AuthError("缺少 MCP upload token")
  return token
}

export function requireJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("application/json")) {
    throw new ValidationError("Content-Type 必须是 application/json")
  }
}

export function mcpJson(value: unknown, init?: ResponseInit) {
  const response = NextResponse.json(value, init)
  response.headers.set("Cache-Control", "no-store")
  return response
}
