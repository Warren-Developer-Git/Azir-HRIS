import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/settings/departments",
        destination: "/settings",
        permanent: false,
      },
      {
        source: "/audit",
        destination: "/audit-logs",
        permanent: false,
      },
      {
        source: "/documents/manage",
        destination: "/documents?tab=awaiting",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
