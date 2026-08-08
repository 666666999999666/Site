import { verifyPassword } from "./password"
import { findFirstUser } from "./repository"
import { getSession } from "./session"
import { LoginAttemptLimiter } from "./login-attempt-limiter"
import { AuthError, ValidationError } from "@/lib/errors"

// 失败次数限流（内存版，单进程够用）
const MAX_FAIL_COUNT = 5
const LOCKOUT_MS = 5 * 60 * 1000
const loginAttemptLimiter = new LoginAttemptLimiter(MAX_FAIL_COUNT, LOCKOUT_MS)

function checkRateLimit(ip: string) {
  if (loginAttemptLimiter.isBlocked(ip)) {
    throw new AuthError("失败次数过多，请稍后再试")
  }
}

function recordFailedAttempt(ip: string) {
  loginAttemptLimiter.recordFailure(ip)
}

function clearFailedAttempts(ip: string) {
  loginAttemptLimiter.clear(ip)
}

// 每 10 分钟清理过期的部分计数和锁定记录，限制单进程内存占用。
// unref 防止 interval 阻止进程优雅退出。
if (typeof setInterval !== "undefined") {
  const handle = setInterval(() => {
    loginAttemptLimiter.cleanup()
  }, 10 * 60 * 1000)
  if (handle.unref) handle.unref()
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
  session.passwordVersion = user.passwordVersion
  await session.save()

  return { userId: user.id, username: user.username }
}

export async function logout() {
  const session = await getSession()
  session.destroy()
}
