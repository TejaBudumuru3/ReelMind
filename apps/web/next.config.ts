import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["db"],

  // 2. Prevent Webpack from destroying the Prisma Rust engine
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};

export default nextConfig;
