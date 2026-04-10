import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import {
  buildHotelGridGlobalData,
  buildWhereToEatDrinkGlobalData,
  buildLocationGridGlobalData,
  getHotelGridSelectionFromItems,
  getWhereToEatDrinkSelectionFromItems,
  getLocationGridSelectionFromItems,
  normalizeHotelGridInput,
  normalizeWhereToEatDrinkInput,
  normalizeLocationGridInput,
  resolveLocationGridScopeFromLocation,
  validateHotelGridItems,
  validateWhereToEatDrinkItems,
  validateLocationGridItems,
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '@/features/homepage-featured-content'
import { APP_CONFIG } from '@/shared/config'
import {
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '@/features/homepage-featured-content/types'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type LocationDoc = {
  id: number
  locationKey?: string
  level?: string
  countryName?: string
  cityName?: string | null
  neighborhoodName?: string | null
}

type RawBlock = {
  id: string
  blockType: string
  slotCount?: number
  items?: unknown
}

type LocationHomepageDoc = {
  id: number
  isEnabled?: boolean
  updatedAt?: string
  location?: LocationDoc | number | null
  pageBlocks?: RawBlock[]
}

function isCuratedBlockType(
  value: unknown,
): value is 'featured-articles' | 'article-grid' | 'location-grid' | 'hotel-grid' | 'where-to-eat-drink' {
  return value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'hotel-grid'
    || value === 'where-to-eat-drink'
}

async function resolveLocationGridScope(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rawLocation: LocationHomepageDoc['location'],
) {
  if (typeof rawLocation === 'object' && rawLocation !== null) {
    return resolveLocationGridScopeFromLocation(rawLocation)
  }

  if (!rawLocation) {
    return null
  }

  const location = await payload.findByID({
    collection: 'locations',
    id: rawLocation,
    depth: 0,
    overrideAccess: true,
  })

  return resolveLocationGridScopeFromLocation(
    location as { level?: unknown; locationKey?: unknown } | null,
  )
}

async function resolvePageBlocks(
  payload: Awaited<ReturnType<typeof getPayload>>,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      if (isCuratedBlockType(block.blockType)) {
        const selection = block.blockType === 'location-grid'
          ? await getLocationGridSelectionFromItems(payload, block.items, {
              totalSlots: block.slotCount,
              scope: locationGridScope,
            })
          : block.blockType === 'hotel-grid'
            ? await getHotelGridSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
              })
            : block.blockType === 'where-to-eat-drink'
              ? await getWhereToEatDrinkSelectionFromItems(payload, block.items, {
                  totalSlots: block.slotCount,
                })
            : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                totalSlots: block.slotCount,
              })
        return {
          id: block.id,
          blockType: block.blockType,
          selection,
        }
      }

      // Unknown block types returned as-is (future-proof)
      return block
    }),
  )
}

function formatHomepageDoc(
  doc: LocationHomepageDoc,
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
) {
  const location =
    typeof doc.location === 'object' && doc.location !== null ? doc.location : null

  return {
    id: doc.id,
    isEnabled: doc.isEnabled ?? false,
    location: location
      ? {
          id: location.id,
          locationKey: location.locationKey ?? null,
          level: location.level ?? null,
          countryName: location.countryName ?? null,
          cityName: location.cityName ?? null,
          neighborhoodName: location.neighborhoodName ?? null,
        }
      : null,
    pageBlocks: resolvedBlocks,
  }
}

// GET /api/location-homepages/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const locationGridScope = await resolveLocationGridScope(payload, doc.location)
    const resolvedBlocks = await resolvePageBlocks(payload, doc.pageBlocks ?? [], locationGridScope)
    return NextResponse.json(formatHomepageDoc(doc, resolvedBlocks), { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load location homepage.') },
      { status: 500, headers },
    )
  }
}

// PUT /api/location-homepages/[id] — update a specific block's items
// Body: { blockId: string, items: HomepageFeaturedItemRef[] }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const body = await req.json().catch(() => null)

    if (!body?.blockId || !Array.isArray(body?.items)) {
      return NextResponse.json(
        { message: 'blockId (string) and items (array) are required.' },
        { status: 400, headers },
      )
    }

    const payload = await getPayload({ config })

    const doc = (await payload.findByID({
      collection: 'location-homepages',
      id,
      depth: 0,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const rawBlocks: RawBlock[] = doc.pageBlocks ?? []
    const blockIndex = rawBlocks.findIndex((b) => b.id === body.blockId)

    if (blockIndex === -1) {
      return NextResponse.json(
        { message: `Block ${body.blockId} not found in this homepage.` },
        { status: 404, headers },
      )
    }

    const block = rawBlocks[blockIndex]

    if (!isCuratedBlockType(block.blockType)) {
      return NextResponse.json(
        { message: `Block type "${block.blockType}" does not support item updates via this endpoint.` },
        { status: 400, headers },
      )
    }

    const blockSlotCount = typeof block.slotCount === 'number' && block.slotCount >= 1
      ? Math.trunc(block.slotCount)
      : HOMEPAGE_FEATURED_CONTENT_SLOTS
    const locationGridScope = await resolveLocationGridScope(payload, doc.location)
    const updatedBlocks = [...rawBlocks]

    if (block.blockType === 'location-grid') {
      const refs = normalizeLocationGridInput(body.items)
      const validatedRefs = await validateLocationGridItems(payload, refs, {
        scope: locationGridScope,
        slotCount: blockSlotCount,
      })

      updatedBlocks[blockIndex] = { ...block, ...buildLocationGridGlobalData(validatedRefs) }
    } else if (block.blockType === 'hotel-grid') {
      if (
        blockSlotCount < HOMEPAGE_HOTEL_GRID_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_HOTEL_GRID_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_HOTEL_GRID_MIN_SLOTS} and ${HOMEPAGE_HOTEL_GRID_MAX_SLOTS} for "hotel-grid".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeHotelGridInput(body.items)
      const validatedRefs = await validateHotelGridItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })

      updatedBlocks[blockIndex] = { ...block, ...buildHotelGridGlobalData(validatedRefs) }
    } else if (block.blockType === 'where-to-eat-drink') {
      if (
        blockSlotCount < HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS
        || blockSlotCount > HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS
      ) {
        return NextResponse.json(
          {
            message: `slotCount must be between ${HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS} and ${HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS} for "where-to-eat-drink".`,
          },
          { status: 400, headers },
        )
      }

      const refs = normalizeWhereToEatDrinkInput(body.items)
      const validatedRefs = await validateWhereToEatDrinkItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })
      updatedBlocks[blockIndex] = { ...block, ...buildWhereToEatDrinkGlobalData(validatedRefs) }
    } else {
      const refs = normalizeHomepageFeaturedInput(body.items)
      const validatedRefs = await validateHomepageFeaturedItems(payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount: blockSlotCount,
      })

      updatedBlocks[blockIndex] = { ...block, ...buildHomepageFeaturedGlobalData(validatedRefs) }
    }

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pageBlocks: updatedBlocks } as any,
      depth: 1,
      overrideAccess: true,
    })) as LocationHomepageDoc

    const updatedScope = await resolveLocationGridScope(payload, updated.location)
    const resolvedBlocks = await resolvePageBlocks(payload, updated.pageBlocks ?? [], updatedScope)
    return NextResponse.json(formatHomepageDoc(updated, resolvedBlocks), { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to update location homepage block.') },
      { status: 400, headers },
    )
  }
}

// DELETE /api/location-homepages/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    await payload.delete({
      collection: 'location-homepages',
      id,
      overrideAccess: true,
    })

    return NextResponse.json({ deleted: true }, { headers })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to delete location homepage.') },
      { status: 400, headers },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
