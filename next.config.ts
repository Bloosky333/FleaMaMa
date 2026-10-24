import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Plan images are resized client-side to stay well below this.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Konva ships an optional Node canvas backend we never use.
  serverExternalPackages: ["konva", "canvas"],
};

export default nextConfig;
