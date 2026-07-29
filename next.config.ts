import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin()

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/bcryptjs/**/*",
      "./node_modules/cookie/**/*",
      "./node_modules/iron-session/**/*",
      "./node_modules/iron-webcrypto/**/*",
      "./node_modules/uncrypto/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "trae-api-cn.mchost.guru" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default withNextIntl(nextConfig)
