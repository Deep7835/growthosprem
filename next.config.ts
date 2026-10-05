import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and data files that must load from node_modules, not a bundle.
  serverExternalPackages: ["@electric-sql/pglite", "sharp"],
};

export default nextConfig;
