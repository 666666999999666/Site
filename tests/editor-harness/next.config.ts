import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost"],
  experimental: {
    externalDir: true,
  },
}

export default nextConfig
