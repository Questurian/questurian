import { NextRequest, NextResponse } from 'next/server'
import { APP_CONFIG, APP_URLS } from '@/shared/config'

const ALLOWED_ORIGINS = APP_CONFIG.CORS_ORIGINS

export function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin')
  const corsOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin : APP_URLS.frontend

  return {
    'Access-Control-Allow-Origin': corsOrigin!,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, ngrok-skip-browser-warning',
  }
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