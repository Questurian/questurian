import { NextRequest, NextResponse } from 'next/server'

import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  deleteLocationHomepage,
  getLocationHomepage,
  updateLocationHomepageBlockContent,
} from '@/features/homepage-featured-content'
import { getErrorMessage } from '@/shared/utils/api-response'

type RouteContext = { params: Promise<{ id: string }> }
type OperationResult = { status: number; body: unknown }
type RouteOperation = (id: string) => Promise<OperationResult>
type JsonRouteOperation = (id: string, body: unknown) => Promise<OperationResult>

async function handleLocationHomepageRoute(
  req: NextRequest,
  { params }: RouteContext,
  operation: RouteOperation,
  fallbackMessage: string,
  errorStatus: number,
): Promise<NextResponse> {
  const headers = getCorsHeaders(req)

  try {
    const authResponse = await authenticateLocationHomepageRequest(req, headers)
    if (authResponse) return authResponse

    const { id } = await params
    const result = await operation(id)

    return NextResponse.json(result.body, { status: result.status, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, fallbackMessage) },
      { status: errorStatus, headers },
    )
  }
}

async function handleLocationHomepageJsonRoute(
  req: NextRequest,
  { params }: RouteContext,
  operation: JsonRouteOperation,
  fallbackMessage: string,
  errorStatus: number,
): Promise<NextResponse> {
  return handleLocationHomepageRoute(
    req,
    { params },
    async (id) => operation(id, await readJsonBody(req)),
    fallbackMessage,
    errorStatus,
  )
}

async function authenticateLocationHomepageRequest(
  req: NextRequest,
  headers: HeadersInit,
): Promise<NextResponse | null> {
  const authResult = await authenticateRequest(req, {
    requireAuth: true,
    allowedRoles: ['admin', 'editor'],
  })

  if (!authResult.error) return null

  return NextResponse.json(
    { message: authResult.error },
    { status: authResult.status, headers },
  )
}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null)
}

// GET /api/location-homepages/[id]
export async function GET(req: NextRequest, { params }: RouteContext) {
  return handleLocationHomepageRoute(
    req,
    { params },
    getLocationHomepage,
    'Failed to load location homepage.',
    500,
  )
}

// PUT /api/location-homepages/[id] - update a specific block's items/settings
export async function PUT(req: NextRequest, { params }: RouteContext) {
  return handleLocationHomepageJsonRoute(
    req,
    { params },
    updateLocationHomepageBlockContent,
    'Failed to update location homepage block.',
    400,
  )
}

// DELETE /api/location-homepages/[id]
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return handleLocationHomepageRoute(
    req,
    { params },
    deleteLocationHomepage,
    'Failed to delete location homepage.',
    400,
  )
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
