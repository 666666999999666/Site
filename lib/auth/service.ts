import { verifyPassword } from "./password"
import { findFirstUser } from "./repository"
import { getSession } from "./session"
import { AuthError, ValidationError } from "@/lib/errors"

// 失败次数限流（内存版，单进程够用）
const MAX_FAIL_COUNT = 5
const LOCKOUT_MS = 5 * 60 * 1000

const failCount = new Map<string, { count: number; until: number }>()

function checkRateLimit(ip: string) {
  const now = Date.now()
  const record = failCount.get(ip)
  if (record && record.until > now) {
    throw new AuthError("失败次数过多，请稍后再试")
  }
}

function recordFailedAttempt(ip: string) {
  const now = Date.now()
  const record = failCount.get(ip)
  const count = (record?.count || 0) + 1
  if (count >= MAX_FAIL_COUNT) {
    failCount.set(ip, { count, until: now + LOCKOUT_MS })
  } else {
    failCount.set(ip, { count, until: 0 })
  }
}

function clearFailedAttempts(ip: string) {
  failCount.delete(ip)
}

export async function login(password: string, ip: string) {
  if (!password) {
    throw new ValidationError("密码必填")
  }

  checkRateLimit(ip)

  const user = await findFirstUser()
  if (!user) {
    throw new AuthError("用户不存在")
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    recordFailedAttempt(ip)
    throw new AuthError("密码错误")
  }

  clearFailedAttempts(ip)

  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isLoggedIn = true
  await session.save()

  return { userId: user.id, username: user.username }
}

export async function logout() {
  const session = await getSession()
  session.destroy()
}
