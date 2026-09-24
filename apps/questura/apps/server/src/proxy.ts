import { NextRequest, NextResponse } from 'next/server'

import { REQUEST_ID_HEADER, acceptOrCreateRequestId } from '@/shared/observability/request-id'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

/**
 * Every request gets an id (`shared/observability/request-id.ts`): the
 * caller's when it sent a well-formed one, otherwise a new one. It is
 * forwarded to the route as `x-request-id`, which is where the logger and the
 * error reporter read it, and echoed on the response so a reader, a load test
 * or the website can quote it.
 */
export function proxy(req: NextRequest) {
  const requestId = acceptOrCreateRequestId(req.headers.get(REQUEST_ID_HEADER))

  if (IS_DEVELOPMENT && req.nextUrl.pathname.startsWith('/api/')) {
    console.log(`${req.method} ${req.nextUrl.pathname} ${requestId}`)
  }

  const headers = new Headers(req.headers)
  headers.set(REQUEST_ID_HEADER, requestId)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
