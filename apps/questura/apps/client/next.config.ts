import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

import { assertProductionBuildEnv } from "./src/lib/release/productionBuildEnv";
import { SECURITY_HEADERS } from "./src/lib/http/securityHeaders";

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
  // Metadata goes in <head>, resolved before the page is sent, for every
  // reader, as Next already does for search bots. Next's default streams it
  // for everyone else, into a hidden <div> React renders ahead of <html>; on
  // a fast load that div was sometimes not yet in the client's tree when
  // hydration began, React matched the page against it, and the whole page
  // was thrown away and rendered again (minified React error #418 on
  // /account, about one load in thirty; launch fix plan item 8). The price is
  // that a dynamic page's <head> waits for its metadata, which the page
  // fetches anyway; prerendered pages are unaffected.
  htmlLimitedBots: /./,
  // Frontend calls backend directly at NEXT_PUBLIC_BACKEND_URL
  // No API proxy needed - cookies work natively on same domain (localhost or questurian.com)
  // Keep ISR output in memory so production traffic cannot mutate immutable
  // commit-addressed release artifacts under .next/server/{app,pages}.
  experimental: {
    isrFlushToDisk: false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
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

// A production build refuses to start without the real API and site
// addresses and a live Stripe key: they are baked into the JavaScript at
// build time, and without them the site would call localhost. The readiness
// sandbox opts out with QUESTURA_BUILD_TARGET=readiness. `next dev` and
// `next start` are not checked. After the build, `scripts/scan-client-bundle.mjs`
// checks the output itself.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) assertProductionBuildEnv(process.env);
  return withNextIntl(nextConfig);
}
