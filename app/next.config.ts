import type { NextConfig } from "next";

// A static site: `next build` writes plain files to out/, which GitHub Pages serves.
// Project pages live under /<repo>/, so the build is given NEXT_PUBLIC_BASE_PATH=/helmroom (empty locally).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
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
