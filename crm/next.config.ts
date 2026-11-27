import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in the back office is per-request (session cookie), so we use the classic dynamic model
  // rather than Cache Components.
  output: "standalone",
  poweredByHeader: false,
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
