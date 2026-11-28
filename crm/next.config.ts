import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in the back office is per-request (session cookie), so we use the classic dynamic model
  // rather than Cache Components.
  output: "standalone",
  poweredByHeader: false,
  // Stamped into the client bundle at build time: the service worker's cache version (src/components/sw-register.tsx).
  env: { NEXT_PUBLIC_BUILD_ID: Date.now().toString(36) },
  // Notes and forms can carry photos (phones shrink them first, but a few full-size ones still pass 1 MB).
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" }, // token links must never leak via Referer
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};

export default nextConfig;
