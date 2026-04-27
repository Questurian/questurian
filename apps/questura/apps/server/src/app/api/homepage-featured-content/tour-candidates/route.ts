import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { searchTourGridCandidates } from '@/features/homepage-featured-content'

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.trunc(parsed)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(req: NextRequest) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const payload = await getPayload({ config })
    const { searchParams } = new URL(req.url)
    const response = await searchTourGridCandidates(payload, {
      query: searchParams.get('q') || undefined,
      page: parsePositiveInt(searchParams.get('page')),
      limit: parsePositiveInt(searchParams.get('limit')),
    })

    return NextResponse.json(response, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load tour candidates.') },
      { status: 500, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
