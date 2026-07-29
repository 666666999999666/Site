import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { ConfigurationError } from '@/lib/errors'

export interface SessionData {
  userId?: string
  username?: string
  isLoggedIn: boolean
}

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new ConfigurationError('SESSION_SECRET 必须至少为 32 个字符')
  }

  return {
    password,
    cookieName: 'blog_session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    },
  }
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions())
}
