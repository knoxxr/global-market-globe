import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/api/market/snapshot",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=15, stale-while-revalidate=45",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
