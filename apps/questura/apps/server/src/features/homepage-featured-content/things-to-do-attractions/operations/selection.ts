import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import type {
  HomepageHotelCandidate,
  HomepageHotelInvalidItem,
  HomepageHotelSelection,
} from '../../types'
import type { ThingsToDoAttractionsSelectionOptions } from '../types'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../constants'
import { parseAttractionSlots } from '../lib/refs'
import { findAttractionDoc } from '../lib/repository'

export async function getThingsToDoAttractionsSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: ThingsToDoAttractionsSelectionOptions = {},
): Promise<HomepageHotelSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = parseAttractionSlots(rawItems)
  const items: HomepageHotelCandidate[] = []
  const invalidItems: HomepageHotelInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({ slot: slot.slot, reason: slot.reason || 'invalid_reference' })
      continue
    }
    const candidate = await findAttractionDoc(payload, slot.ref)
    if (!candidate) {
      invalidItems.push({ slot: slot.slot, id: slot.ref.id, reason: 'not_found' })
      continue
    }
    if (!allowDrafts && candidate.status !== 'published') {
      invalidItems.push({
        slot: slot.slot,
        id: candidate.id,
        title: candidate.title,
        reason: 'not_published',
      })
      continue
    }
    items.push({ ...candidate, slot: slot.slot })
  }

  return {
    items,
    invalidItems,
    allowDrafts,
    totalSlots,
    isComplete:
      items.length === totalSlots && invalidItems.length === 0 && parsedSlots.length === totalSlots,
  }
}
