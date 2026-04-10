import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// PATCH /api/location-homepages/[id]/toggle — flip isEnabled
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor'],
    })

    if (authResult.error) {
      return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
    }

    const { id } = await params
    const payload = await getPayload({ config })

    const current = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 0,
      overrideAccess: true,
    })) as { id: number; isEnabled?: boolean }

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      data: { isEnabled: !current.isEnabled },
      depth: 0,
      overrideAccess: true,
    })) as { id: number; isEnabled?: boolean }

    return NextResponse.json({ id: updated.id, isEnabled: updated.isEnabled ?? false }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to toggle location homepage.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
