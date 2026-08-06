import { NextRequest } from "next/server"

const ALLOWED_ORIGINS = [
  "https://liaoqizai.site",
  "https://www.liaoqizai.site",
  // 开发环境
  "http://localhost:3000",
]

export function validateOrigin(req: NextRequest, options?: { requireOrigin?: boolean }): boolean {
  const origin = req.headers.get("origin")
  const referer = req.headers.get("referer")

  // 如果有 Origin 头，校验是否在白名单中
  if (origin) return ALLOWED_ORIGINS.includes(origin)

  // 如果没有 Origin 但有 Referer，校验 Referer
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      return ALLOWED_ORIGINS.includes(refererOrigin)
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
