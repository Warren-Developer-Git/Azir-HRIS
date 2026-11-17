import type { NextConfig } from "next";
import { resolveApiProxyTarget } from "./lib/proxy-url";

const isProd = process.env.NODE_ENV === "production";
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: cspDirectives },
        ],
      },
    ];
  },
  async rewrites() {
    const apiTarget = resolveApiProxyTarget(process.env.API_URL);
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/:path*`,
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
      {
        source: "/payroll/my-payslips",
        destination: "/payroll?tab=my-payslips",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
