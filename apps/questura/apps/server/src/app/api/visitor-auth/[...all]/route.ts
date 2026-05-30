import { toNextJsHandler } from 'better-auth/next-js'
import type { NextRequest } from 'next/server'

import { visitorAuth } from '@/features/visitor-auth/lib/better-auth'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

const handlers = toNextJsHandler(visitorAuth)

async function withCors(req: NextRequest, handler: (request: Request) => Promise<Response>) {
  const response = await handler(req)
  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(getCorsHeaders(req))) {
    headers.set(key, value)
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
