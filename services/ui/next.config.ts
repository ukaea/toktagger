import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: "http://api_app:8002/:path*",
      },
    ];
  },
};

export default nextConfig;
