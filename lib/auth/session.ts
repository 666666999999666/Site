import { getIronSession, unsealData, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { ConfigurationError } from '@/lib/errors'

export interface SessionData {
  userId?: string
  username?: string
  isLoggedIn: boolean
  passwordVersion?: number
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new ConfigurationError('SESSION_SECRET 必须至少为 32 个字符')
  }

  return {
    password,
    cookieName: 'blog_session',
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  }
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions())
}

/**
 * 在 proxy.ts（Node.js runtime）中解密验证 cookie 有效性。
 * 使用 unsealData 直接解密 cookie 值，无需 getIronSession 的 Request 对象。
 * unsealData 的 ttl 单位为秒，与普通会话使用同一有效期。
 */
export async function getProxySession(cookieValue: string | undefined): Promise<SessionData | null> {
  if (!cookieValue) return null
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) return null

  try {
    const session = await unsealData<SessionData>(cookieValue, {
      password,
      ttl: SESSION_TTL_SECONDS,
    })
    return session.isLoggedIn ? session : null
  } catch {
    return null
  }
}
