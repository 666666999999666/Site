import { splitSetCookieHeader } from "better-auth/cookies"

export function copyAuthSetCookies(source: Response, target: Response): void {
  const value = source.headers.get("set-cookie")
  if (!value) return
  for (const cookie of splitSetCookieHeader(value)) {
    target.headers.append("set-cookie", cookie)
  }
}
