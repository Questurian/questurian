import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Lets a production build for measurement live beside a running `pnpm dev`
  // without clobbering its `.next` (apps/questura/docs/capacity/README.md).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // How long a shared cache may keep serving a page past its revalidate
  // window (`stale-while-revalidate` on the HTML). Next's default is a year,
  // so a CDN that does not receive our tag purges could keep showing an
  // unpublished page for up to a year. A week bounds that and still rides out
  // a long backend outage on stale pages.
  expireTime: 7 * 24 * 60 * 60,
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
