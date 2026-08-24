export function isRetiredEnglishPath(pathname: string): boolean {
  return pathname === "/en" || pathname.startsWith("/en/")
}
