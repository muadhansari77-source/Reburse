import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
