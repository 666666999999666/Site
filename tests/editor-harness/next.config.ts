import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["localhost"],
  experimental: {
    externalDir: true,
  },
}

export default nextConfig
