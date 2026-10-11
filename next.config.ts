import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
const config: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    ...Object.values(networkInterfaces()).flatMap((entries) =>
      (entries ?? [])
        .filter((entry) => entry.family === "IPv4")
        .map((entry) => entry.address),
    ),
    ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ],
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
