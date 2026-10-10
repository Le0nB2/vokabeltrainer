import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist", "canvas"],
};

export default nextConfig;
