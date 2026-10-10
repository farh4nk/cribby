import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Pi image (see web/Dockerfile).
  output: "standalone",
  // Teammates open the dev server through Tailscale HTTPS (https://<machine>.<tailnet>.ts.net).
  allowedDevOrigins: ["**.ts.net"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
