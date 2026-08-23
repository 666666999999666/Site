export type QuestionApiErrorPayload = {
  error?: string
  code?: string
}
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
  const response = await fetch(input, init)
  const payload = await response.json().catch(() => null) as (T & QuestionApiErrorPayload) | null

  if (!response.ok) {
    throw new QuestionApiError(
      payload?.error || `请求失败（${response.status}）`,
      response.status,
      payload?.code
    )
  }

  return payload as T
}

export function questionJsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

export function questionErrorMessage(error: unknown, fallback = "操作失败"): string {
  return error instanceof Error ? error.message : fallback
}
