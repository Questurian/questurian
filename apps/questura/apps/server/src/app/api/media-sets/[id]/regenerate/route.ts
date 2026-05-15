import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { regenerateVariantsForMediaSet } from '@/features/media/pipeline/regenerate-variants'
import { getErrorMessage } from '@/shared/utils/api-response'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/media-sets/[id]/regenerate
//
// Re-runs the variant pipeline for the existing MediaSet using its `source`
// + `focal_point`. Replaces all variant assets with fresh crops.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = getCorsHeaders(req)

  try {
    const authResult = await authenticateRequest(req, {
      requireAuth: true,
      allowedRoles: ['admin', 'editor', 'writer'],
    })
    if (authResult.error) {
      return NextResponse.json(
        { message: authResult.error },
        { status: authResult.status, headers },
      )
    }

    const { id: rawId } = await params
    const mediaSetId = Number.parseInt(rawId, 10)
    if (!Number.isFinite(mediaSetId) || mediaSetId <= 0) {
      return NextResponse.json(
        { message: 'media set id must be a positive integer' },
        { status: 400, headers },
      )
    }

    const payload = await getPayload({ config })
    const result = await regenerateVariantsForMediaSet({ payload, mediaSetId })

    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to regenerate variants.') },
      { status: 500, headers },
    )
  }
}
