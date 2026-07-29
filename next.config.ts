import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin()

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
}

export default withNextIntl(nextConfig)
