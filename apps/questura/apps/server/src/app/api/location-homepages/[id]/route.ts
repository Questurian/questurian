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
  buildTourGridGlobalData,
  buildThingsToDoAttractionsGlobalData,
  buildThingsToDoListiclesGlobalData,
  buildWhereToEatDrinkGlobalData,
  buildLocationGridGlobalData,
  buildQuesturianMapsGlobalData,
  normalizeTourGridInput,
  normalizeHotelGridInput,
  normalizeThingsToDoAttractionsInput,
  normalizeThingsToDoListiclesInput,
  normalizeWhereToEatDrinkInput,
  normalizeLocationGridInput,
  normalizeQuesturianMapsInput,
  validateTourGridItems,
  validateHotelGridItems,
  validateThingsToDoAttractionsItems,
  validateThingsToDoListiclesItems,
  validateWhereToEatDrinkItems,
  validateLocationGridItems,
  validateQuesturianMapsItems,
  buildHomepageFeaturedGlobalData,
  homepageBlockSupportsSectionHeading,
  normalizeHomepageFeaturedInput,
  parseSectionHeadingBodyField,
  parseSectionSubheadingBodyField,
  parseSlot3LayoutBodyField,
  parseSlot4LayoutBodyField,
  parseSlot5LayoutBodyField,
  parseLocationGridMediaAspectBodyField,
  parseArticleGridFourLayoutBodyField,
  validateHomepageFeaturedItems,
  resolveStoredSlotCountForBlockType,
  type LocationDoc,
  type RawBlock,
  type LocationHomepageDoc,
  isCuratedBlockType,
  resolveLocationGridScope,
  resolvePageBlocks,
  formatHomepageDoc,
} from '@/features/homepage-featured-content'
import { APP_CONFIG } from '@/shared/config'
import {
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_TOUR_GRID_MAX_SLOTS,
  HOMEPAGE_TOUR_GRID_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
} from '@/features/homepage-featured-content/types'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
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
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

    if (!body?.blockId || typeof body.blockId !== 'string') {
      return NextResponse.json(
        { message: 'blockId (string) is required.' },
        { status: 400, headers },
      )
    }

    const sectionHeadingParse = parseSectionHeadingBodyField(body)
    if (!sectionHeadingParse.ok) {
      return NextResponse.json({ message: sectionHeadingParse.message }, { status: 400, headers })
    }

    const sectionSubheadingParse = parseSectionSubheadingBodyField(body)
    if (!sectionSubheadingParse.ok) {
      return NextResponse.json({ message: sectionSubheadingParse.message }, { status: 400, headers })
    }

    const slot3LayoutParse = parseSlot3LayoutBodyField(body)
    if (!slot3LayoutParse.ok) {
      return NextResponse.json({ message: slot3LayoutParse.message }, { status: 400, headers })
    }

    const slot4LayoutParse = parseSlot4LayoutBodyField(body)
    if (!slot4LayoutParse.ok) {
      return NextResponse.json({ message: slot4LayoutParse.message }, { status: 400, headers })
    }

    const slot5LayoutParse = parseSlot5LayoutBodyField(body)
    if (!slot5LayoutParse.ok) {
      return NextResponse.json({ message: slot5LayoutParse.message }, { status: 400, headers })
    }

    const mediaAspectParse = parseLocationGridMediaAspectBodyField(body)
    if (!mediaAspectParse.ok) {
      return NextResponse.json({ message: mediaAspectParse.message }, { status: 400, headers })
    }

    const articleGridFourLayoutParse = parseArticleGridFourLayoutBodyField(body)
    if (!articleGridFourLayoutParse.ok) {
      return NextResponse.json(
        { message: articleGridFourLayoutParse.message },
        { status: 400, headers },
      )
    }

    const hasItems = Array.isArray(body.items)
    if (
      !hasItems
      && sectionHeadingParse.omit
      && sectionSubheadingParse.omit
      && slot3LayoutParse.omit
      && slot4LayoutParse.omit
      && slot5LayoutParse.omit
      && mediaAspectParse.omit
      && articleGridFourLayoutParse.omit
    ) {
      return NextResponse.json(
        {
          message:
            'Provide items (array) and/or sectionHeading and/or sectionSubheading and/or slot3Layout and/or slot4Layout and/or slot5Layout and/or mediaAspect and/or articleGridFourLayout to update this block.',
        },
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

    if (!slot3LayoutParse.omit) {
      const slot3SlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      if (block.blockType !== 'featured-articles' || slot3SlotCount !== 3) {
        return NextResponse.json(
          {
            message: 'slot3Layout is only supported for featured-articles blocks with 3 slots.',
          },
          { status: 400, headers },
        )
      }
    }

    if (!slot4LayoutParse.omit) {
      const slot4SlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      if (block.blockType !== 'featured-articles' || slot4SlotCount !== 4) {
        return NextResponse.json(
          {
            message: 'slot4Layout is only supported for featured-articles blocks with 4 slots.',
          },
          { status: 400, headers },
        )
      }
    }

    if (!slot5LayoutParse.omit) {
      const slot5SlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      if (block.blockType !== 'featured-articles' || slot5SlotCount !== 5) {
        return NextResponse.json(
          {
            message: 'slot5Layout is only supported for featured-articles blocks with 5 slots.',
          },
          { status: 400, headers },
        )
      }
    }

    if (!mediaAspectParse.omit && block.blockType !== 'location-grid') {
      return NextResponse.json(
        { message: 'mediaAspect is only supported for location-grid blocks.' },
        { status: 400, headers },
      )
    }

    if (!articleGridFourLayoutParse.omit) {
      const agSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      if (block.blockType !== 'article-grid' || agSlotCount !== 4) {
        return NextResponse.json(
          {
            message:
              'articleGridFourLayout is only supported for article-grid blocks with 4 slots.',
          },
          { status: 400, headers },
        )
      }
    }

    if (!sectionHeadingParse.omit && !homepageBlockSupportsSectionHeading(block.blockType)) {
      return NextResponse.json(
        { message: 'sectionHeading is not supported for this block type.' },
        { status: 400, headers },
      )
    }

    if (!sectionSubheadingParse.omit && !homepageBlockSupportsSectionHeading(block.blockType)) {
      return NextResponse.json(
        { message: 'sectionSubheading is not supported for this block type.' },
        { status: 400, headers },
      )
    }

    const locationGridScope = await resolveLocationGridScope(payload, doc.location)
    const updatedBlocks = [...rawBlocks]

    if (!hasItems) {
      const blockSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      const wantsHeading = !sectionHeadingParse.omit
      const wantsSubheading = !sectionSubheadingParse.omit
      const wantsSlot3 = !slot3LayoutParse.omit
      const wantsSlot4 = !slot4LayoutParse.omit
      const wantsSlot5 = !slot5LayoutParse.omit
      const wantsMediaAspect = !mediaAspectParse.omit
      const wantsArticleGridFour = !articleGridFourLayoutParse.omit

      if (
        !wantsHeading
        && !wantsSubheading
        && !wantsSlot3
        && !wantsSlot4
        && !wantsSlot5
        && !wantsMediaAspect
        && !wantsArticleGridFour
      ) {
        return NextResponse.json(
          {
            message:
              'Provide sectionHeading (string or null) and/or sectionSubheading (string or null) and/or slot3Layout and/or slot4Layout and/or slot5Layout and/or mediaAspect and/or articleGridFourLayout when items are omitted.',
          },
          { status: 400, headers },
        )
      }

      if (wantsHeading && !homepageBlockSupportsSectionHeading(block.blockType)) {
        return NextResponse.json(
          { message: 'sectionHeading is not supported for this block type.' },
          { status: 400, headers },
        )
      }

      if (wantsSubheading && !homepageBlockSupportsSectionHeading(block.blockType)) {
        return NextResponse.json(
          { message: 'sectionSubheading is not supported for this block type.' },
          { status: 400, headers },
        )
      }

      if (wantsMediaAspect && block.blockType !== 'location-grid') {
        return NextResponse.json(
          { message: 'mediaAspect is only supported for location-grid blocks.' },
          { status: 400, headers },
        )
      }

      if (wantsArticleGridFour) {
        if (block.blockType !== 'article-grid' || blockSlotCount !== 4) {
          return NextResponse.json(
            {
              message:
                'articleGridFourLayout is only supported for article-grid blocks with 4 slots.',
            },
            { status: 400, headers },
          )
        }
      }

      let next: RawBlock = {
        ...block,
        slotCount: blockSlotCount,
      }
      if (wantsHeading) {
        next = { ...next, sectionHeading: sectionHeadingParse.value }
      }
      if (wantsSubheading) {
        next = { ...next, sectionSubheading: sectionSubheadingParse.value }
      }
      if (wantsSlot3) {
        next = { ...next, slot3Layout: slot3LayoutParse.value }
      }
      if (wantsSlot4) {
        next = { ...next, slot4Layout: slot4LayoutParse.value }
      }
      if (wantsSlot5) {
        next = { ...next, slot5Layout: slot5LayoutParse.value }
      }
      if (wantsMediaAspect) {
        next = { ...next, mediaAspect: mediaAspectParse.value }
      }
      if (wantsArticleGridFour) {
        next = { ...next, articleGridFourLayout: articleGridFourLayoutParse.value }
      }
      updatedBlocks[blockIndex] = next
    } else {
      const items = body.items as unknown[]

      const blockSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)

      if (block.blockType === 'location-grid') {
        const refs = normalizeLocationGridInput(items)
        const validatedRefs = await validateLocationGridItems(payload, refs, {
          scope: locationGridScope,
          slotCount: blockSlotCount,
        })

        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildLocationGridGlobalData(validatedRefs),
        }
      } else if (block.blockType === 'questurian-maps') {
        if (blockSlotCount !== HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT) {
          return NextResponse.json(
            {
              message: `slotCount must be ${HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT} for "questurian-maps".`,
            },
            { status: 400, headers },
          )
        }

        const refs = normalizeQuesturianMapsInput(items)
        const validatedRefs = await validateQuesturianMapsItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })

        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildQuesturianMapsGlobalData(validatedRefs),
        }
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

        const refs = normalizeHotelGridInput(items)
        const validatedRefs = await validateHotelGridItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })

        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildHotelGridGlobalData(validatedRefs),
        }
      } else if (block.blockType === 'tour-grid') {
        if (
          blockSlotCount < HOMEPAGE_TOUR_GRID_MIN_SLOTS
          || blockSlotCount > HOMEPAGE_TOUR_GRID_MAX_SLOTS
        ) {
          return NextResponse.json(
            {
              message: `slotCount must be between ${HOMEPAGE_TOUR_GRID_MIN_SLOTS} and ${HOMEPAGE_TOUR_GRID_MAX_SLOTS} for "tour-grid".`,
            },
            { status: 400, headers },
          )
        }

        const refs = normalizeTourGridInput(items)
        const validatedRefs = await validateTourGridItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })

        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildTourGridGlobalData(validatedRefs),
        }
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

        const refs = normalizeWhereToEatDrinkInput(items)
        const validatedRefs = await validateWhereToEatDrinkItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })
        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildWhereToEatDrinkGlobalData(validatedRefs),
        }
      } else if (block.blockType === 'things-to-do-listicles') {
        if (
          blockSlotCount < HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS
          || blockSlotCount > HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS
        ) {
          return NextResponse.json(
            {
              message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS} for "things-to-do-listicles".`,
            },
            { status: 400, headers },
          )
        }

        const refs = normalizeThingsToDoListiclesInput(items)
        const validatedRefs = await validateThingsToDoListiclesItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })
        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildThingsToDoListiclesGlobalData(validatedRefs),
        }
      } else if (block.blockType === 'things-to-do-attractions') {
        if (
          blockSlotCount < HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS
          || blockSlotCount > HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS
        ) {
          return NextResponse.json(
            {
              message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS} for "things-to-do-attractions".`,
            },
            { status: 400, headers },
          )
        }

        const refs = normalizeThingsToDoAttractionsInput(items)
        const validatedRefs = await validateThingsToDoAttractionsItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })
        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildThingsToDoAttractionsGlobalData(validatedRefs),
        }
      } else if (block.blockType === 'newsletter-signup') {
        return NextResponse.json(
          { message: '"newsletter-signup" blocks do not support item updates.' },
          { status: 400, headers },
        )
      } else {
        const refs = normalizeHomepageFeaturedInput(items)
        const validatedRefs = await validateHomepageFeaturedItems(payload, refs, {
          allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
          slotCount: blockSlotCount,
        })

        updatedBlocks[blockIndex] = {
          ...block,
          slotCount: blockSlotCount,
          ...buildHomepageFeaturedGlobalData(validatedRefs),
        }
      }

      if (homepageBlockSupportsSectionHeading(block.blockType) && !sectionHeadingParse.omit) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          sectionHeading: sectionHeadingParse.value,
        }
      }

      if (homepageBlockSupportsSectionHeading(block.blockType) && !sectionSubheadingParse.omit) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          sectionSubheading: sectionSubheadingParse.value,
        }
      }

      if (
        block.blockType === 'featured-articles'
        && blockSlotCount === 3
        && !slot3LayoutParse.omit
      ) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          slot3Layout: slot3LayoutParse.value,
        }
      }

      if (
        block.blockType === 'featured-articles'
        && blockSlotCount === 4
        && !slot4LayoutParse.omit
      ) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          slot4Layout: slot4LayoutParse.value,
        }
      }

      if (
        block.blockType === 'featured-articles'
        && blockSlotCount === 5
        && !slot5LayoutParse.omit
      ) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          slot5Layout: slot5LayoutParse.value,
        }
      }

      if (block.blockType === 'location-grid' && !mediaAspectParse.omit) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          mediaAspect: mediaAspectParse.value,
        }
      }

      if (
        block.blockType === 'article-grid'
        && blockSlotCount === 4
        && !articleGridFourLayoutParse.omit
      ) {
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          articleGridFourLayout: articleGridFourLayoutParse.value,
        }
      }
    }

    const updated = (await payload.update({
      collection: 'location-homepages',
      id,
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
