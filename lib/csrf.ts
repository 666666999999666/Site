import { NextRequest } from "next/server"

const PRODUCTION_ORIGINS = [
  "https://liaoqizai.site",
  "https://www.liaoqizai.site",
]

function allowedOrigins(): Set<string> {
  const origins = new Set(PRODUCTION_ORIGINS)
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    try {
      const url = new URL(configured)
      if (process.env.NODE_ENV !== "production" || url.protocol === "https:") {
        origins.add(url.origin)
      }
    } catch {
      // Invalid deployment configuration must not broaden the allowlist.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000")
    origins.add("http://127.0.0.1:3000")
  }
  return origins
}

export function validateOrigin(req: NextRequest, options?: { requireOrigin?: boolean }): boolean {
  const origin = req.headers.get("origin")
  const referer = req.headers.get("referer")
  const allowed = allowedOrigins()

  // 如果有 Origin 头，校验是否在白名单中
  if (origin) return allowed.has(origin)

  // 如果没有 Origin 但有 Referer，校验 Referer
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      return allowed.has(refererOrigin)
    } catch {
      return false
    }
  }

  // 无 Origin/Referer 的请求：
  // - logout 端点：允许通过（logout 的 CSRF 风险较低，且 SameSite=lax 已部分缓解）
  // - login 端点：拒绝（requireOrigin: true），防止非浏览器客户端绕过 CSRF 检查
  if (options?.requireOrigin) return false
  return true
}
