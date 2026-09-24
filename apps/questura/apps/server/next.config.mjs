import { withPayload } from '@payloadcms/next/withPayload'

/**
 * Sent on every API response and every Payload admin page (launch harness
 * D4). Same set as the client (`apps/client/src/lib/http/securityHeaders.ts`,
 * which says why each one is there). The admin is the page here with buttons
 * worth clickjacking; nothing frames it on purpose.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  // Lets a production build for measurement live beside a running `pnpm dev`
  // without clobbering its `.next` (docs/capacity/README.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    // Temporary: allow builds while legacy type errors are being cleaned up incrementally.
    ignoreBuildErrors: true,
  },
  // Next 16 builds with Turbopack, which ignores this block (withPayload adds
  // a `turbopack` key, so Next does not refuse the webpack config) and resolves
  // `./x.js` -> `./x.ts` itself. Kept, as in Payload's own template, for
  // `next build --webpack`.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
