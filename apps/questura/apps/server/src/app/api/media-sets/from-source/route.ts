import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { assembleMediaSetFromSource } from '@/features/media/pipeline/assemble-media-set'
import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import type { FocalPoint, VariantOverride } from '@/features/media/pipeline/from-source'
import { getErrorMessage } from '@/shared/utils/api-response'

const ACCEPTED_SOURCE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

type ParsedBody = {
  title: string
  alt_text?: string | null
  photographer_credit?: string | null
  location?: string | null
  locationRef?: number | null
  externalRef?: string | null
  tags?: number[] | null
  focal_point?: Partial<FocalPoint> | null
  overrides?: Partial<Record<MediaVariantKey, VariantOverride>>
}

const parseBody = (raw: unknown): { body: ParsedBody } | { error: string } => {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'data must be a JSON object' }
  }
  const obj = raw as Record<string, unknown>

  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  if (!title) return { error: 'title is required' }

  const overridesRaw = obj.overrides
  let overrides: ParsedBody['overrides']
  if (overridesRaw !== undefined && overridesRaw !== null) {
    if (typeof overridesRaw !== 'object') {
      return { error: 'overrides must be an object keyed by variant' }
    }
    const result: Partial<Record<MediaVariantKey, VariantOverride>> = {}
    for (const [key, value] of Object.entries(overridesRaw as Record<string, unknown>)) {
      if (!MEDIA_VARIANT_KEYS.includes(key as MediaVariantKey)) {
        return { error: `unknown variant key in overrides: ${key}` }
      }
      if (
        typeof value !== 'object' ||
        value === null ||
        typeof (value as VariantOverride).left !== 'number' ||
        typeof (value as VariantOverride).top !== 'number' ||
        typeof (value as VariantOverride).width !== 'number' ||
        typeof (value as VariantOverride).height !== 'number'
      ) {
        return { error: `override for ${key} must be { left, top, width, height } numbers` }
      }
      result[key as MediaVariantKey] = value as VariantOverride
    }
    overrides = result
  }

  const focalRaw = obj.focal_point
  let focal_point: ParsedBody['focal_point']
  if (focalRaw !== undefined && focalRaw !== null) {
    if (typeof focalRaw !== 'object') {
      return { error: 'focal_point must be { x, y } numbers' }
    }
    const f = focalRaw as { x?: unknown; y?: unknown }
    focal_point = {
      x: typeof f.x === 'number' ? f.x : undefined,
      y: typeof f.y === 'number' ? f.y : undefined,
    }
  }

  return {
    body: {
      title,
      alt_text: typeof obj.alt_text === 'string' ? obj.alt_text : null,
      photographer_credit:
        typeof obj.photographer_credit === 'string' ? obj.photographer_credit : null,
      location: typeof obj.location === 'string' ? obj.location : null,
      locationRef: typeof obj.locationRef === 'number' ? obj.locationRef : null,
      externalRef: typeof obj.externalRef === 'string' ? obj.externalRef : null,
      tags: Array.isArray(obj.tags)
        ? (obj.tags as unknown[])
            .map((value) => (typeof value === 'number' ? value : Number.parseInt(String(value), 10)))
            .filter((value): value is number => Number.isFinite(value))
        : null,
      focal_point,
      overrides,
    },
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/media-sets/from-source
//
// multipart/form-data:
//   - source: File (image/jpeg | image/png | image/webp)
//   - data: JSON string (ParsedBody)
export async function POST(req: NextRequest) {
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

    const formData = await req.formData()
    const sourceField = formData.get('source')
    const dataField = formData.get('data')

    if (!(sourceField instanceof Blob)) {
      return NextResponse.json(
        { message: 'source file is required (multipart field "source")' },
        { status: 400, headers },
      )
    }

    if (typeof dataField !== 'string') {
      return NextResponse.json(
        { message: 'data is required (multipart JSON string field "data")' },
        { status: 400, headers },
      )
    }

    const sourceMime = sourceField.type
    if (!ACCEPTED_SOURCE_MIMES.has(sourceMime)) {
      return NextResponse.json(
        { message: `unsupported source mime type: ${sourceMime}` },
        { status: 415, headers },
      )
    }

    if (sourceField.size > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        { message: `source exceeds max size of ${MAX_SOURCE_BYTES} bytes` },
        { status: 413, headers },
      )
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(dataField)
    } catch {
      return NextResponse.json(
        { message: 'data must be valid JSON' },
        { status: 400, headers },
      )
    }

    const parsed = parseBody(parsedJson)
    if ('error' in parsed) {
      return NextResponse.json({ message: parsed.error }, { status: 400, headers })
    }

    const sourceFilename =
      sourceField instanceof File && sourceField.name ? sourceField.name : 'source-upload'

    const sourceArrayBuffer = await sourceField.arrayBuffer()
    const sourceBuffer = Buffer.from(sourceArrayBuffer)

    const payload = await getPayload({ config })

    const result = await assembleMediaSetFromSource({
      payload,
      source: { buffer: sourceBuffer, mimetype: sourceMime, filename: sourceFilename },
      focalPoint: parsed.body.focal_point,
      overrides: parsed.body.overrides,
      metadata: {
        title: parsed.body.title,
        alt_text: parsed.body.alt_text,
        photographer_credit: parsed.body.photographer_credit,
        location: parsed.body.location,
        locationRef: parsed.body.locationRef,
        externalRef: parsed.body.externalRef,
        tags: parsed.body.tags,
      },
    })

    return NextResponse.json(
      {
        mediaSetId: result.mediaSetId,
        sourceAssetId: result.sourceAssetId,
        variantAssetIds: result.variantAssetIds,
      },
      { status: 201, headers },
    )
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to assemble media set from source.') },
      { status: 500, headers },
    )
  }
}
