import type { Payload } from 'payload'

import { getHomepageFeaturedSelectionFromItems } from '../../featured-articles/service'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedSelection,
} from '../../featured-articles/types'

import { HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT, QUESTURIAN_MAPS_RELATION } from '../constants'

export async function getQuesturianMapsSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: { allowDrafts?: boolean; totalSlots?: number } = {},
): Promise<HomepageFeaturedSelection> {
  const totalSlots = HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT
  const base = await getHomepageFeaturedSelectionFromItems(payload, rawItems, {
    ...options,
    totalSlots,
  })

  const kept: HomepageFeaturedCandidate[] = []
  const movedToInvalid: HomepageFeaturedInvalidItem[] = []

  for (const item of base.items) {
    if (item.relationTo === QUESTURIAN_MAPS_RELATION) {
      kept.push(item)
    } else {
      movedToInvalid.push({
        slot: item.slot ?? 0,
        relationTo: item.relationTo,
        id: item.id,
        collectionLabel: item.collectionLabel,
        reason: 'invalid_reference',
      })
    }
  }

  const invalidItems = [...base.invalidItems, ...movedToInvalid]

  return {
    items: kept,
    invalidItems,
    allowDrafts: base.allowDrafts,
    totalSlots,
    isComplete: kept.length === totalSlots && invalidItems.length === 0,
  }
}
