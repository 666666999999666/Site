export interface ApiErrorPayload {
  error?: string
  code?: string
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  createError: (message: string, status: number, code?: string) => Error = (message) => new Error(message)
): Promise<T> {
  const response = await fetch(input, init)
  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null

  if (!response.ok) {
    throw createError(payload?.error || `请求失败（${response.status}）`, response.status, payload?.code)
  }

  return payload as T
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}
