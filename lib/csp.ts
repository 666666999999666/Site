export function buildContentSecurityPolicy(nonce: string, development: boolean): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `script-src-attr 'none'`,
    // Mermaid creates temporary style elements while rendering. Script execution remains nonce-only.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ]
  if (!development) directives.push("upgrade-insecure-requests")
  return directives.join("; ")
}
