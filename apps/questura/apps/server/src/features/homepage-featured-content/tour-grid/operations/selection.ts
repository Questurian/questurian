import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import type {
  HomepageTourCandidate,
  HomepageTourInvalidItem,
  HomepageTourSelection,
  TourGridSelectionOptions,
} from '../types'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../constants'
import { parseTourGridSlots } from '../lib/refs'
import { findTourDoc } from '../lib/repository'

export async function getTourGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: TourGridSelectionOptions = {},
): Promise<HomepageTourSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = parseTourGridSlots(rawItems)
  const items: HomepageTourCandidate[] = []
  const invalidItems: HomepageTourInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({ slot: slot.slot, reason: slot.reason || 'invalid_reference' })
      continue
    }
    const candidate = await findTourDoc(payload, slot.ref)
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
