import { headers } from "next/headers"
import { auth } from "../auth/better-auth"
import { AuthError } from "../errors"

export interface AuthenticatedAdmin {
  userId: string
  username: string
  isLoggedIn: true
}

export async function ensureAuthenticated(): Promise<AuthenticatedAdmin> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new AuthError("未登录")

  return {
    userId: session.user.id,
    username: session.user.name,
    isLoggedIn: true,
  }
}
