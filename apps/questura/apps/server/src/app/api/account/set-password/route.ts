import { NextRequest, NextResponse } from 'next/server'

import { visitorAuth } from '@/features/visitor-auth/lib/better-auth'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const body = await req.json() as { newPassword?: unknown }
    if (typeof body.newPassword !== 'string') {
      return NextResponse.json(
        { error: 'A new password is required.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const result = await visitorAuth.api.setPassword({
      body: { newPassword: body.newPassword },
      headers: req.headers,
    })

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set password.'
    return NextResponse.json({ error: message }, { status: 400, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
