import { NextRequest, NextResponse } from 'next/server'
import { APP_CONFIG } from '@/shared/config'

const ALLOWED_ORIGINS = APP_CONFIG.CORS_ORIGINS

export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, ngrok-skip-browser-warning, x-captcha-response',
    'Vary': 'Origin',
  }

  // Only reflect origins on the allowlist; disallowed origins get no
  // Access-Control-Allow-Origin header at all (the browser then blocks them).
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
