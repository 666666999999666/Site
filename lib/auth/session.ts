import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: string
  username?: string
  isLoggedIn: boolean
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'blog_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https'),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 小时
  },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
