import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in the back office is per-request (session cookie), so we use the classic dynamic model
  // rather than Cache Components.
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"], // dev only: the preview pane uses 127.0.0.1, and without this client code never hydrates there
  // Stamped into the client bundle at build time: the service worker's cache version (src/components/sw-register.tsx).
  env: { NEXT_PUBLIC_BUILD_ID: Date.now().toString(36) },
  // Server actions that carry a file: note attachments, expense receipts, the logo (each up to the 25 MB file limit in
  // src/server/media.ts), the client CSV (1 MB) and signature data URLs (under 0.5 MB). So: one 25 MB file plus the form.
  // Photo uploads don't come through here; they go to the /api upload routes, which cap what they read themselves (cappedFormData).
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
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
