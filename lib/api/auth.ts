import { getSession } from "@/lib/auth/session"
import { AuthError } from "@/lib/errors"
import { prisma } from "@/lib/db"

export async function ensureAuthenticated() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    throw new AuthError("未登录")
  }

  // #12: 验证用户是否仍存在 + #8: 校验密码版本（修改密码后旧 session 失效）
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordVersion: true },
  })
  if (!user || user.passwordVersion !== session.passwordVersion) {
    session.destroy()
    throw new AuthError("会话已失效，请重新登录")
  }

  return session
}
