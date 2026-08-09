const LOOPBACK_HOSTS = new Set([
  "127.0.0.1:3000",
  "localhost:3000",
  "[::1]:3000",
])

const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
])

function headerValues(value: string | null): string[] {
  return value
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean) ?? []
}

function containsOnlyLoopbackHosts(value: string | null): boolean {
  const values = headerValues(value)
  return values.length === 0 || values.every((item) => LOOPBACK_HOSTS.has(item))
}

function containsOnlyLoopbackAddresses(value: string | null): boolean {
  const values = headerValues(value)
  return values.length === 0 || values.every((item) => LOOPBACK_ADDRESSES.has(item))
}

export function isDirectLoopbackRequest(request: Pick<Request, "headers">): boolean {
  const host = request.headers.get("host")?.trim().toLowerCase()
  if (!host || !LOOPBACK_HOSTS.has(host)) return false

  return containsOnlyLoopbackHosts(request.headers.get("x-forwarded-host"))
    && containsOnlyLoopbackAddresses(request.headers.get("x-forwarded-for"))
    && containsOnlyLoopbackAddresses(request.headers.get("x-real-ip"))
}
