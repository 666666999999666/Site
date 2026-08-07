import { NextRequest, NextResponse } from "next/server"
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { getProxySession } from "@/lib/auth/session"
import { randomUUID } from "crypto"

// next-intl i18n middleware
const intlMiddleware = createIntlMiddleware(routing)

// U14: nonce-based CSP。每次请求生成随机 nonce，注入 CSP 头与 x-nonce 请求头。
// nonce 方案要求动态渲染——本项目公开页面本就是 force-dynamic，无额外代价。
function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  // 开发环境 React 用 eval 重建错误栈，需 unsafe-eval；生产不需要。
  const scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
  const styleSrc = `'self'${isDev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ")
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 保护 /admin 路径（页面路由；API 路由由 handler 级 ensureAuthenticated 保护）
  if (pathname.startsWith("/admin")) {
    const sessionCookie = req.cookies.get("blog_session")?.value
    const session = await getProxySession(sessionCookie)
    if (!session) {
      // 未登录重定向到首页——首页响应会带 CSP，重定向本身无需 CSP
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = "/"
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
    // admin 放行：用 NextResponse.next({ request: { headers } }) 把 nonce 透传给 SSR
    const nonce = Buffer.from(randomUUID()).toString("base64")
    const csp = buildCspHeader(nonce)
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set("Content-Security-Policy", csp)
    return response
  }

  // i18n 路由处理 + U14: 直接在原 req.headers 上 set，next-intl 会保留这些请求头
  // 透传给 SSR，使 headers() 能读到 x-nonce、Next.js SSR 引擎能从 Content-Security-Policy
  // 请求头解析 nonce 自动给框架脚本加 nonce（next-intl 官方推荐的组合模式）。
  const nonce = Buffer.from(randomUUID()).toString("base64")
  const csp = buildCspHeader(nonce)
  req.headers.set("x-nonce", nonce)
  req.headers.set("Content-Security-Policy", csp)

  const response = intlMiddleware(req)

  // R2-U4: 为 NEXT_LOCALE cookie 添加 Secure 属性
  const localeCookie = req.cookies.get("NEXT_LOCALE")?.value
  if (localeCookie) {
    response.cookies.set("NEXT_LOCALE", localeCookie, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })
  }

  // 给浏览器下发的 CSP 头（含本次 nonce）
  response.headers.set("Content-Security-Policy", csp)

  return response
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*', '/admin/:path*'],
}
