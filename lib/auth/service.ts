import { AuthError, ValidationError } from "../errors"
import { prisma } from "../db"
import { auth } from "./better-auth"
import { LoginAttemptLimiter } from "./login-attempt-limiter"
import { hashPassword, verifyPassword } from "./password"
import { findFirstUser } from "./repository"

const MAX_FAIL_COUNT = 5
const LOCKOUT_MS = 5 * 60 * 1000
const loginAttemptLimiter = new LoginAttemptLimiter(MAX_FAIL_COUNT, LOCKOUT_MS)

if (typeof setInterval !== "undefined") {
  const handle = setInterval(() => loginAttemptLimiter.cleanup(), 10 * 60 * 1000)
  if (handle.unref) handle.unref()
}

export async function login(password: string, ip: string, requestHeaders: Headers) {
  if (!password) throw new ValidationError("密码必填")
  if (loginAttemptLimiter.isBlocked(ip)) {
    throw new AuthError("失败次数过多，请稍后再试")
  }

  const user = await findFirstUser()
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    loginAttemptLimiter.recordFailure(ip)
    throw new AuthError("密码错误")
  }

  let response: Response
  try {
    response = await auth.api.signInEmail({
      body: {
        email: user.email,
        password,
        rememberMe: true,
      },
      headers: requestHeaders,
      asResponse: true,
    })
  } catch (error) {
    loginAttemptLimiter.recordFailure(ip)
    throw error
  }

  if (!response.ok) {
    loginAttemptLimiter.recordFailure(ip)
    throw new AuthError("密码错误")
  }

  loginAttemptLimiter.clear(ip)
  return { response, userId: user.id, username: user.username }
}

export function logout(requestHeaders: Headers) {
  return auth.api.signOut({ headers: requestHeaders, asResponse: true })
}

export async function changeAdminPassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AuthError("当前密码错误")
  }

  const passwordHash = await hashPassword(input.newPassword)
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 },
      },
    })
    await transaction.account.upsert({
      where: {
        providerId_accountId: { providerId: "credential", accountId: user.id },
      },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      },
      update: { password: passwordHash },
    })
    await transaction.session.deleteMany({ where: { userId: user.id } })
  })

  return { userId: user.id, passwordHash }
}
