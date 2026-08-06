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
  // #10: 惰性清理已过期的锁定记录（until > 0 且已过期）。
  // 注意：不能删 until=0 的记录——那是未达锁定阈值的计数，仍在累积，删了会重置计数导致限流失效。
  if (record && record.until > 0 && record.until <= now) {
    failCount.delete(ip)
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

// #10: 每 10 分钟扫描清理已过期的锁定记录（until > 0 且已过期），
// 作为惰性清理的补充，防止从未再次访问的 IP 的过期记录长期堆积。
// unref 防止 interval 阻止进程优雅退出。
if (typeof setInterval !== "undefined") {
  const handle = setInterval(() => {
    const now = Date.now()
    for (const [ip, record] of failCount) {
      if (record.until > 0 && record.until <= now) {
        failCount.delete(ip)
      }
    }
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
  await session.save()

  return { userId: user.id, username: user.username }
}

export async function logout() {
  const session = await getSession()
  session.destroy()
}
