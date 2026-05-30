import { NextRequest, NextResponse } from 'next/server'

import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'

export async function GET(req: NextRequest) {
  const principal = await getCurrentPrincipal(req.headers)

  return NextResponse.json(principal, {
    headers: getCorsHeaders(req),
  })
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
