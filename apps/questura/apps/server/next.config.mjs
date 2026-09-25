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

/**
 * Payload's client hints, on the admin only (launch fix plan item 8).
 *
 * `withPayload` sends `Accept-CH`, `Vary` and `Critical-CH:
 * Sec-CH-Prefers-Color-Scheme` on every path, for the admin's light or dark
 * theme. `Critical-CH` makes Chrome answer a top-level navigation that lacked
 * the hint by sending the same request again, with it. The first copy has
 * already been served by then. On `/api/visitor-auth/callback/google` that
 * spends the OAuth state, so the retry fails with `state_mismatch` and the
 * reader lands on this API's root instead of being signed in: every reader
 * whose Chrome had never opened the API host before, which is every reader.
 * Found by the Google browser journey; Firefox does not retry.
 */
export function scopeClientHintsToAdmin(config) {
  const payloadHeaders = config.headers
  const isHint = ({ key, value }) =>
    /^(accept-ch|critical-ch)$/i.test(key) || (/^vary$/i.test(key) && /^sec-ch-prefers-color-scheme$/i.test(value.trim()))
  return {
    ...config,
    async headers() {
      const rules = payloadHeaders ? await payloadHeaders() : []
      return rules.flatMap((rule) => {
        const hints = rule.headers.filter(isHint)
        if (hints.length === 0) return [rule]
        const rest = rule.headers.filter((header) => !isHint(header))
        return [...(rest.length ? [{ ...rule, headers: rest }] : []), { ...rule, source: '/admin/:path*', headers: hints }]
      })
    },
  }
}

export default scopeClientHintsToAdmin(withPayload(nextConfig, { devBundleServerPackages: false }))
