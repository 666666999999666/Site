import { NextResponse } from "next/server"

export function privateNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
