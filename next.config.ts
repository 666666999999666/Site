import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/bcryptjs/**/*",
      "./node_modules/cookie/**/*",
      "./node_modules/uncrypto/**/*",
      "./node_modules/@prisma/adapter-pg/**/*",
      "./node_modules/pg/**/*",
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
