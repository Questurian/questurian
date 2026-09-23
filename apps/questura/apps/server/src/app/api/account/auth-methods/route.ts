import { NextRequest, NextResponse } from 'next/server'

import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getCurrentAuthMethods } from '@/features/visitor-auth/lib/current-principal'
import { runPrivateWork } from '@/features/visitor-auth/lib/private-route'
import { hasVisitorSessionCookie } from '@/features/visitor-auth/lib/session-cookie'

/**
 * How the signed-in reader signs in: local password, Google, or both. Only
 * the account page asks, so the accounts query is no longer paid by every
 * `/api/me` and every gate. One reader's state, from the session cookie:
 * private CORS, the origin guard, and never stored in between.
 */
export const dynamic = 'force-dynamic'

const unauthenticated = (corsHeaders: Record<string, string>) =>
  NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders })

export async function GET(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  // No session cookie: nothing to look up, and no limiter or gate to pay.
  if (!hasVisitorSessionCookie(req.headers)) return unauthenticated(corsHeaders)

  return runPrivateWork(
    { headers: req.headers, signal: req.signal, corsHeaders, route: '/api/account/auth-methods' },
    async () => {
      const methods = await getCurrentAuthMethods(req.headers)
      if (!methods) return unauthenticated(corsHeaders)
      return NextResponse.json(methods, { headers: corsHeaders })
    },
  )
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
