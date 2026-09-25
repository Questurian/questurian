import { NextRequest, NextResponse } from 'next/server'

import {
  CLIENT_ADDRESS_HEADERS,
  ORIGIN_AUTH_HEADER,
  originAuthVerdict,
  readOriginAuthConfig,
} from '@/shared/http/origin-auth'
import { REQUEST_ID_HEADER, acceptOrCreateRequestId } from '@/shared/observability/request-id'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

/**
 * Every request gets an id (`shared/observability/request-id.ts`): the
 * caller's when it sent a well-formed one, otherwise a new one. It is
 * forwarded to the route as `x-request-id`, which is where the logger and the
 * error reporter read it, and echoed on the response so a reader, a load test
 * or the website can quote it.
 *
 * Then the front door (`shared/http/origin-auth.ts`, ADR-0016): with
 * `ORIGIN_AUTH_SECRET` set, a request without the matching
 * `X-Questura-Origin-Auth` header came round Cloudflare, not through it. It is
 * refused, or in `unidentified` mode served with every address header removed
 * so it lands in the shared rate-limit bucket. Either way the header itself is
 * removed here, before any route, logger or error reporter can see it.
 */
export function proxy(req: NextRequest) {
  const requestId = acceptOrCreateRequestId(req.headers.get(REQUEST_ID_HEADER))

  if (IS_DEVELOPMENT && req.nextUrl.pathname.startsWith('/api/')) {
    console.log(`${req.method} ${req.nextUrl.pathname} ${requestId}`)
  }

  const config = readOriginAuthConfig()
  const verdict = originAuthVerdict(req.headers, req.nextUrl.pathname, config)

  if ((verdict === 'missing' || verdict === 'wrong') && config.mode === 'refuse') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'cache-control': 'no-store', [REQUEST_ID_HEADER]: requestId } },
    )
  }

  const headers = new Headers(req.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  headers.delete(ORIGIN_AUTH_HEADER)
  if (verdict === 'missing' || verdict === 'wrong') {
    for (const name of CLIENT_ADDRESS_HEADERS) headers.delete(name)
  }

  const response = NextResponse.next({ request: { headers } })
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
