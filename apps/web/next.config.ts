import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// The repository keeps one .env at the root so the web app, the fallback API,
// the worker and the CLI scripts all read exactly the same configuration.
// `next build` and `next start` run with apps/web as the working directory, so
// the default loader would never see it.
loadEnvConfig(path.join(process.cwd(), "..", ".."));

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@campussphere/core", "@campussphere/contracts"],
  // The development server refuses server-action requests whose Origin it does
  // not recognise. Sandboxed previews and tunnels serve the app from their own
  // hostname, so the dev origin has to be allowed explicitly; production reads
  // NEXT_PUBLIC_SITE_URL and is unaffected.
  allowedDevOrigins: ["*.e2b.app", "*.trycloudflare.com", "*.ngrok-free.app"],
  experimental: {
    serverActions: { bodySizeLimit: "512kb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default config;
