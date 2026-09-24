/**
 * Sent on every page (`next.config.ts`, source `/:path*`). Launch harness D4.
 *
 * - `X-Frame-Options` and `frame-ancestors 'none'`: no other site may frame
 *   ours. Framed, a signed-in reader could be tricked into clicking a real
 *   button (Subscribe, Cancel subscription) laid under a decoy. Nothing here
 *   frames the site itself: no Payload live preview, no iframe of our pages.
 * - `nosniff`: a response is only ever what its Content-Type says.
 * - `Referrer-Policy`: other sites see our origin, never a full path that
 *   could carry `?returnTo=` or a session id.
 * - HSTS, one year, deliberately without `includeSubDomains` or `preload`:
 *   those commit every current and future subdomain to https and are hard to
 *   undo, so they are the owner's call. Browsers ignore HSTS over plain http,
 *   so localhost is unaffected.
 *
 * `frame-ancestors` is the only CSP directive set. A full policy needs a
 * report-only period first; see the launch harness handoff, D4.
 */
export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];
