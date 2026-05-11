import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Frontend calls backend directly at NEXT_PUBLIC_BACKEND_URL
  // No API proxy needed - cookies work natively on same domain (localhost or questurian.com)
};

export default withNextIntl(nextConfig);
