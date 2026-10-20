import { apiRequest, type ApiErrorPayload } from "@/lib/api-client"

export { jsonRequest as questionJsonRequest } from "@/lib/api-client"
export type QuestionApiErrorPayload = ApiErrorPayload

export class QuestionApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "QuestionApiError"
    this.status = status
    this.code = code
  }
}

export async function questionApiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  return apiRequest<T>(input, init, (message, status, code) => new QuestionApiError(message, status, code))
}

export function questionErrorMessage(error: unknown, fallback = "操作失败"): string {
  return error instanceof Error ? error.message : fallback
}
