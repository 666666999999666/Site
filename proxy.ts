import { NextRequest, NextResponse } from "next/server"

// Next.js 16: middleware 已重命名为 proxy
// 文档: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
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
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
