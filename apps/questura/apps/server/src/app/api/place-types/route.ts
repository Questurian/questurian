/**
 * Place Types API Route
 * Unified endpoint for fetching place type options by category
 *
 * GET /api/place-types?category=dining
 * GET /api/place-types?category=accommodations
 * GET /api/place-types?category=nightlife
 * GET /api/place-types?category=attractions
 */

import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'
import { getSelectFieldOptions } from '@/shared/utils/payload-fields'

// Map category to detail collection slug
const categoryToCollectionMap: Record<string, string> = {
  dining: 'dining-details',
  accommodations: 'accommodation-details',
  nightlife: 'nightlife-details',
  attractions: 'attraction-details',
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    if (!category) {
      return corsResponse({ error: 'Missing category query parameter' }, req, 400)
    }

    const collectionSlug = categoryToCollectionMap[category]
    if (!collectionSlug) {
      return corsResponse(
        {
          error: `Invalid category. Must be one of: ${Object.keys(categoryToCollectionMap).join(', ')}`,
        },
        req,
        400,
      )
    }

    const payload = await getPayload({ config })
    const collection = payload.collections?.[collectionSlug as keyof typeof payload.collections]
    const fields = collection?.config?.fields ?? []
    const options = getSelectFieldOptions(fields, 'type')

    if (!options) {
      return corsResponse({ error: 'Type field not found' }, req, 404)
    }

    return corsResponse({ category, options }, req)
  } catch (error) {
    console.error('Error loading place types:', error)
    return corsResponse({ error: 'Failed to load place types' }, req, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
