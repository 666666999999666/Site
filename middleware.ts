import { NextRequest, NextResponse } from "next/server"
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// next-intl i18n middleware
const intlMiddleware = createIntlMiddleware(routing)

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 保护 /admin 路径（页面与 API）
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get("blog_session")?.value
    if (!session) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = "/"
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // 跳过 API 路由
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  // i18n 路由处理
  return intlMiddleware(req)
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*', '/admin/:path*'],
}
