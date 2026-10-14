import type { NextConfig } from "next";

// Where the Django API lives, as seen from the Next.js server.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Django URLs end in "/", so don't let Next strip or add trailing slashes.
  skipTrailingSlashRedirect: true,
  // Let the dev server be opened as http://127.0.0.1:3000 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    // The browser only ever talks to this origin. `/api/*` is forwarded to Django,
    // which keeps the httpOnly session cookie first-party and avoids CORS entirely.
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  experimental: {
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
