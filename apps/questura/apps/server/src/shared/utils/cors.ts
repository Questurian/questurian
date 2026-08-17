import { NextRequest, NextResponse } from 'next/server'
import { APP_CONFIG } from '@/shared/config'

const ALLOWED_ORIGINS = APP_CONFIG.CORS_ORIGINS

/**
 * Whether an `Origin` header names one of this deployment's own origins.
 *
 * CORS alone only stops a cross-origin caller *reading* the response; a route
 * that changes state on a cookie session needs to reject the request itself.
 */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin)
}

/**
 * Same rule Better Auth's router uses: a cookie session with a missing or
 * untrusted Origin is rejected, not merely CORS-blocked. Cross-site POST
 * already drops SameSite=Lax cookies; this closes same-site-but-untrusted
 * hosts (any sibling under the cookie's eTLD+1).
 */
export function isForbiddenOrigin(req: { headers: Headers }): boolean {
  const origin = req.headers.get('origin')
  const carriesCookie = Boolean(req.headers.get('cookie'))

  if (carriesCookie) {
    return !origin || !isAllowedOrigin(origin)
  }

  return Boolean(origin && !isAllowedOrigin(origin))
}

export function forbiddenOriginResponse(req: NextRequest, corsHeaders: Record<string, string>) {
  if (!isForbiddenOrigin(req)) return null

  return NextResponse.json({ error: 'Origin not allowed.' }, { status: 403, headers: corsHeaders })
}

export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, ngrok-skip-browser-warning, x-captcha-response',
    'Vary': 'Origin',
  }

  // Only reflect origins on the allowlist; disallowed origins get no
  // Access-Control-Allow-Origin header at all (the browser then blocks them).
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}

/**
 * `no-store` rather than `private`. A shared cache honouring `private` is the
 * exact failure this exists to prevent, and a per-caller response is never
 * worth caching anyway. `Vary: Cookie` is appended to the `Vary: Origin` that
 * CORS already sets, so a cache that stores the response despite `no-store`
 * still keys it by session rather than serving one visitor's copy to everyone.
 */
const NO_STORE = 'no-store, no-cache, must-revalidate'

/**
 * CORS headers for a route whose body depends on who is asking.
 *
 * Next treats a route that reads headers as dynamic on its own, but Cloudflare
 * sits in front of this origin (TRUSTED_PROXY) and one cache rule matching
 * `/api/*` is enough to hand one visitor's identity, membership or billing
 * state to everyone. Every cookie-authenticated route states its own terms
 * rather than relying on that rule never being written.
 */
export function getPrivateCorsHeaders(req: NextRequest): Record<string, string> {
  const headers = getCorsHeaders(req)

  return {
    ...headers,
    'Cache-Control': NO_STORE,
    'Vary': [headers['Vary'], 'Cookie'].filter(Boolean).join(', '),
  }
}

export function handleCorsOptions(req: NextRequest) {
  return new NextResponse('', {
    status: 200,
    headers: getCorsHeaders(req)
  })
}

export function corsResponse(data: any, req: NextRequest, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: getCorsHeaders(req)
  })
}
