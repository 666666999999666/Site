import { getSession } from "@/lib/auth/session"
import { AuthError } from "@/lib/errors"

export async function ensureAuthenticated() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    throw new AuthError("未登录")
  }
  return session
}
