import type { NextConfig } from "next";

// cacheComponents is intentionally disabled: almost every page in IssueFlow AI
// reads the Supabase session cookie, so classic dynamic rendering is simpler.
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
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
