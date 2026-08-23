import { NextResponse } from "next/server"
import { handleApiError } from "./handler"

export function privateNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export function handlePrivateApiError(error: unknown): NextResponse {
  return privateNoStore(handleApiError(error))
}
