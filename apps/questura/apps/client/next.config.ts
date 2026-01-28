import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Frontend calls backend directly at NEXT_PUBLIC_BACKEND_URL
  // No API proxy needed - cookies work natively on same domain (localhost or questurian.com)
};

export default nextConfig;
