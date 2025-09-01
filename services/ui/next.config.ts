import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // tells Next.js to generate static HTML
  trailingSlash: true, // optional: generates folders for routes instead of HTML files

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
