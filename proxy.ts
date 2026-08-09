import { NextRequest, NextResponse } from "next/server"
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { auth } from "@/lib/auth/better-auth"
import { randomUUID } from "crypto"
import { buildContentSecurityPolicy } from "@/lib/csp"

// next-intl i18n middleware
const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 保护 /admin 路径（页面路由；API 路由由 handler 级 ensureAuthenticated 保护）
  if (pathname.startsWith("/admin")) {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user?.id) {
      // 未登录重定向到首页——首页响应会带 CSP，重定向本身无需 CSP
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = "/"
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
    // admin 放行：用 NextResponse.next({ request: { headers } }) 把 nonce 透传给 SSR
    const nonce = Buffer.from(randomUUID()).toString("base64")
    const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development")
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set("Content-Security-Policy", csp)
    return response
  }

  // OAuth 登录与授权页不属于多语言路由，直接放行并附加 CSP。
  if (pathname.startsWith("/oauth")) {
    const nonce = Buffer.from(randomUUID()).toString("base64")
    const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development")
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
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development")
  req.headers.set("x-nonce", nonce)
  req.headers.set("Content-Security-Policy", csp)

  const response = intlMiddleware(req)

  // 给浏览器下发的 CSP 头（含本次 nonce）
  response.headers.set("Content-Security-Policy", csp)

  return response
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*', '/admin/:path*', '/oauth/:path*'],
}
