export function isInboxEnabled(): boolean {
  const value = process.env.INBOX_ENABLED?.trim().toLowerCase()
  return value === undefined || value === "" || value === "true"
}
