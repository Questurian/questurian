import type { Field, Where } from 'payload'
import {
  normalizeRelationshipId,
  normalizeRelationshipIds,
  relationshipIdToKey,
} from './itemMedia/relationshipIds'

export const TOUR_PICKS_MAX = 4

/**
 * Tour Picks (ADR 0013): the curated, ordered subset of the selected
 * attraction's LM-linked tours featured on one listicle entry. Stored as live
 * references — tour content stays canonical in Location Manager → Payload.
 * Picks must come from the attraction's linked tour list; an attraction with
 * no linked tours has nothing pickable.
 */
export const createTourPicksField = (): Field => ({
  name: 'tours',
  label: 'Tour Picks',
  type: 'relationship',
  relationTo: 'tours',
  hasMany: true,
  maxRows: TOUR_PICKS_MAX,
  filterOptions: async ({ siblingData, req }): Promise<Where | boolean> => {
    const sibling = siblingData as Record<string, unknown> | undefined
    const attractionId = normalizeRelationshipId(sibling?.item)
    if (attractionId === null) {
      return false
    }

    try {
      const attraction = await req.payload.findByID({
        collection: 'attractions',
        id: attractionId,
        depth: 0,
      })
      const linkedTourIds = normalizeRelationshipIds(attraction.tours)
      if (!linkedTourIds.length) {
        return false
      }
      return { id: { in: linkedTourIds } }
    } catch {
      return false
    }
  },
  admin: {
    description: `Tour Picks: up to ${TOUR_PICKS_MAX} of this attraction's linked tours, in display order`,
  },
})

/**
 * Server-side enforcement of the Tour Picks rules (the admin filterOptions
 * only guards the picker UI, not API writes): at most TOUR_PICKS_MAX picks,
 * every pick linked to the selected attraction.
 */
export const validateTourPicks = (params: {
  blockTours: unknown
  sourceItem: Record<string, unknown>
  itemLabel: string
}): void => {
  const { blockTours, sourceItem, itemLabel } = params

  const pickedTourIds = normalizeRelationshipIds(blockTours)
  if (!pickedTourIds.length) {
    return
  }

  if (pickedTourIds.length > TOUR_PICKS_MAX) {
    throw new Error(`${itemLabel} can feature at most ${TOUR_PICKS_MAX} tour picks.`)
  }

  const linkedTourKeys = new Set(
    normalizeRelationshipIds(sourceItem.tours).map(relationshipIdToKey),
  )
  const invalidTourId = pickedTourIds.find(
    (tourId) => !linkedTourKeys.has(relationshipIdToKey(tourId)),
  )

  if (invalidTourId !== undefined) {
    throw new Error(
      `${itemLabel} tour pick ${invalidTourId} is not linked to the selected attraction.`,
    )
  }
}
