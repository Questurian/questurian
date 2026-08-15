import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Frontend calls backend directly at NEXT_PUBLIC_BACKEND_URL
  // No API proxy needed - cookies work natively on same domain (localhost or questurian.com)
  // Keep ISR output in memory so production traffic cannot mutate immutable
  // commit-addressed release artifacts under .next/server/{app,pages}.
  experimental: {
    isrFlushToDisk: false,
  },
  async headers() {
    return [
      {
        // Join hero globe derivatives are width-versioned filenames
        // (questurian-globe-1650.webp); new artwork gets new names, so the
        // bytes at a given URL never change.
        source: "/images/join/:file(.*\\.webp)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
