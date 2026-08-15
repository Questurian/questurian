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
