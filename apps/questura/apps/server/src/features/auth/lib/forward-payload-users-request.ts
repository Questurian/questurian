import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders } from '@/shared/utils/cors'

/**
 * Forwards to Payload REST under `/api/users/...` (same origin) so clients can use
 * `/api/auth/*` aliases (e.g. AI Blog Writer AuthProvider) without 404s.
 */
export async function forwardPayloadUsersRequest(
  req: NextRequest,
  usersPathSegment: string,
): Promise<NextResponse> {
  const targetUrl = new URL(`/api/users/${usersPathSegment}`, req.nextUrl.origin)
  const forwardHeaders = new Headers()

  const auth = req.headers.get('authorization')
  if (auth) {
    forwardHeaders.set('authorization', auth)
  }
  const cookie = req.headers.get('cookie')
  if (cookie) {
    forwardHeaders.set('cookie', cookie)
  }
  const accept = req.headers.get('accept')
  if (accept) {
    forwardHeaders.set('accept', accept)
  }
  const contentType = req.headers.get('content-type')
  if (contentType) {
    forwardHeaders.set('content-type', contentType)
  }

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers: forwardHeaders,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: 'no-store',
  })

  const responseHeaders = new Headers(getCorsHeaders(req))
  const upstreamContentType = upstream.headers.get('content-type')
  if (upstreamContentType) {
    responseHeaders.set('content-type', upstreamContentType)
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
