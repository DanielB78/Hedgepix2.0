import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloud Agent / local testing via 127.0.0.1 (Next treats
  // localhost vs 127.0.0.1 as cross-origin for /_next assets).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
