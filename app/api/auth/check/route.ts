import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"

export async function GET() {
  const session = await getSession()
  // iron-session 在无 cookie 时返回空对象，isLoggedIn 为 undefined，
  // 需强制转为 boolean 以保证 JSON 输出 { isLoggedIn: false }
  return NextResponse.json({ isLoggedIn: Boolean(session.isLoggedIn) })
}
