import { NextRequest } from 'next/server'

import { getCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { legacyUserFromPrincipal, responseWithCors } from '@/features/visitor-auth/lib/legacy-auth-compat'
import { handleCorsOptions } from '@/shared/utils/cors'

export async function GET(req: NextRequest) {
  const current = await getCurrentPrincipal(req.headers)
  return responseWithCors(req, {
    authenticated: current.authenticated,
    user: legacyUserFromPrincipal(current.principal),
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
