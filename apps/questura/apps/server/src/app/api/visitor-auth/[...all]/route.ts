import { toNextJsHandler } from 'better-auth/next-js'
import type { NextRequest } from 'next/server'

import { visitorAuth } from '@/features/visitor-auth/lib/better-auth'
import { withClientIdentity } from '@/features/visitor-auth/lib/client-identity'
import { AdmissionRefused } from '@/shared/http/admission'
import { admitPublicWork, overloadedResponse } from '@/shared/http/public-read'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { logger } from '@/shared/utils/logger'

const handlers = toNextJsHandler(visitorAuth)

/**
 * Every Better Auth route — sign-in, sign-up, callbacks, get-session — runs
 * inside ingress and then the `auth` gate (`shared/http/admission.ts`).
 *
 * Better Auth's own rate limiter counts requests per address and path; it
 * does not bound how many password hashes run at once, and a burst of
 * distinct addresses each under their limit could occupy every core with
 * scrypt while page readers queued behind them. The gate is small and
 * patient: a person signing in waits longer than a page reader would, and a
 * refusal is a no-store 503 with `Retry-After`, never a half-written session.
 * Callback and provider contracts are unchanged — the handler that runs is
 * Better Auth's, untouched, once admitted.
 *
 * Better Auth is told who is calling by `withClientIdentity`, never by a
 * header the caller wrote; `client-identity.ts` has the production gap that
 * closes.
 */
async function withCors(req: NextRequest, handler: (request: Request) => Promise<Response>) {
  let response: Response

  try {
    response = await admitPublicWork(
      'ingress',
      () => admitPublicWork('auth', () => handler(withClientIdentity(req)), req.signal ?? undefined),
      req.signal ?? undefined,
    )
  } catch (error) {
    if (error instanceof AdmissionRefused) {
      response = overloadedResponse(error)
    } else if (error instanceof Response) {
      response = error
    } else {
      // Logged, because a silent 500 here once hid that every sign-in failed.
      logger.error('Visitor auth request failed', {
        path: new URL(req.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      })
      response = Response.json({ error: 'Authentication request failed' }, { status: 500 })
    }
  }

  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(getCorsHeaders(req))) {
    headers.set(key, value)
  }

  // Better Auth's limiter says when to come back in `X-Retry-After`, a header
  // nothing reads. Clients and proxies read `Retry-After`.
  const betterAuthRetry = headers.get('x-retry-after')
  if (response.status === 429 && betterAuthRetry && !headers.has('retry-after')) {
    headers.set('Retry-After', betterAuthRetry)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export function GET(req: NextRequest) {
  return withCors(req, handlers.GET)
}

export function POST(req: NextRequest) {
  return withCors(req, handlers.POST)
}

export function PATCH(req: NextRequest) {
  return withCors(req, handlers.PATCH)
}

export function PUT(req: NextRequest) {
  return withCors(req, handlers.PUT)
}

export function DELETE(req: NextRequest) {
  return withCors(req, handlers.DELETE)
}
