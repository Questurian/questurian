import { APIError } from 'better-auth/api'
import { NextRequest, NextResponse } from 'next/server'

import { visitorAuth } from '@/features/visitor-auth/lib/better-auth'
import { checkSetPasswordRateLimit } from '@/features/visitor-auth/lib/set-password-rate-limit'
import { getPasswordStrengthError } from '@/shared/lib/password-strength'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

/**
 * Server adapter for Better Auth's `setPassword`, which the browser client does
 * not expose (ADR-0004). It is the only way an OAuth-only visitor can add a
 * password, and it is deliberately not a duplicate of anything.
 *
 * Calling `visitorAuth.api.setPassword` skips `visitorAuth.handler`, and with it
 * three protections the router applies to every real Better Auth path:
 *
 * - `onRequestRateLimit`, hence `checkSetPasswordRateLimit` below.
 * - `originCheckMiddleware`, hence the explicit origin check below.
 * - the path-keyed `hooks.before` middleware — in effect. `setPassword` is a
 *   *pathless* endpoint (`createAuthEndpoint({...})` with no path string), and
 *   better-call resolves a middleware's path to `"/"` when the endpoint has
 *   none, so `getVisitorPasswordError` is asked about `"/"` and never matched
 *   its `/set-password` entry. Strength is therefore enforced here, against the
 *   same `shared/lib/password-strength` rule, before delegating. Better Auth's
 *   own check is a length floor only.
 *
 * Everything else stays Better Auth's: it requires a live session, and refuses
 * outright once a credential password exists, so this cannot overwrite one.
 */
export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkSetPasswordRateLimit(req.headers)
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: corsHeaders }
    )
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
    return response
  }

  try {
    const body = await req.json() as { newPassword?: unknown }
    if (typeof body.newPassword !== 'string') {
      return NextResponse.json(
        { error: 'A new password is required.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const strengthError = getPasswordStrengthError(body.newPassword)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 400, headers: corsHeaders })
    }

    const result = await visitorAuth.api.setPassword({
      body: { newPassword: body.newPassword },
      headers: req.headers,
    })

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    // APIError messages are written by better-auth for the client; anything else stays server-side.
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.body?.message ?? 'Failed to set password.' },
        { status: error.statusCode, headers: corsHeaders }
      )
    }
    console.error('Error setting password:', error)
    return NextResponse.json({ error: 'Failed to set password.' }, { status: 400, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
