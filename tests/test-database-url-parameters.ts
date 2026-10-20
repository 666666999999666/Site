type TestDatabaseParameterPolicy = {
  allowSchema?: boolean
  message?: string
}

/** pg query parameters can override the destination checked in the URL authority/path. */
export function assertSafeTestDatabaseUrlParameters(
  parsed: URL,
  {
    allowSchema = true,
    message = "Test database URLs must not contain connection overrides, duplicate schema parameters or fragments",
  }: TestDatabaseParameterPolicy = {}
) {
  // URLSearchParams decodes keys, so encoded aliases and duplicates cannot evade the allowlist.
  const keys = [...parsed.searchParams.keys()]
  if (parsed.href.includes("#") ||
    keys.length > (allowSchema ? 1 : 0) ||
    keys.some((key) => key !== "schema")) {
    throw new Error(message)
  }
}
