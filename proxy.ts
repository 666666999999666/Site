import { NextRequest, NextResponse } from "next/server"
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { getProxySession } from "@/lib/auth/session"

// next-intl i18n middleware
const intlMiddleware = createIntlMiddleware(routing)

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 保护 /admin 路径（页面路由；API 路由由 handler 级 ensureAuthenticated 保护）
  if (pathname.startsWith("/admin")) {
    const sessionCookie = req.cookies.get("blog_session")?.value
    const session = await getProxySession(sessionCookie)
    if (!session) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = "/"
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // i18n 路由处理
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

  return response
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*', '/admin/:path*'],
}
