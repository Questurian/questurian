import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../types'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedPlaceholderOptions,
  HomepageFeaturedSelection,
  HomepageFeaturedSelectionOptions,
} from '../types'

import { readWithBoundedConcurrency } from '../../reference-grid/bounded-reads'
import { getHomepageFeaturedCollectionLabel } from '../lib/candidate'
import { parseHomepageFeaturedSlots } from '../lib/refs'
import { findHomepageFeaturedDoc } from '../lib/repository'

export async function getHomepageFeaturedSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: HomepageFeaturedSelectionOptions = {},
): Promise<HomepageFeaturedSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  // Never resolve more slots than the (possibly snapped) total. A legacy block stored with more
  // items than its current slot count — e.g. a 6-item block snapped to 5 because 6 has no layout —
  // drops its trailing items here instead of reading as permanently incomplete/blocked.
  const parsedSlots = parseHomepageFeaturedSlots(rawItems).slice(0, totalSlots)
  const items: HomepageFeaturedCandidate[] = []
  const invalidItems: HomepageFeaturedInvalidItem[] = []

  // Read first, decide after. Awaiting each document inside the decision loop
  // made a seven-slot block seven sequential round trips, each one populating
  // relationships three levels deep. The decision loop below is unchanged, so
  // slot order, invalid reasons and completeness cannot move.
  const candidates = await readWithBoundedConcurrency(parsedSlots, (slot) =>
    slot.ref ? findHomepageFeaturedDoc(payload, slot.ref) : Promise.resolve(null),
  )

  for (const [index, slot] of parsedSlots.entries()) {
    if (!slot.ref) {
      invalidItems.push({
        slot: slot.slot,
        reason: slot.reason || 'invalid_reference',
      })
      continue
    }

    const candidate = candidates[index]

    if (!candidate) {
      invalidItems.push({
        slot: slot.slot,
        relationTo: slot.ref.relationTo,
        id: slot.ref.id,
        collectionLabel: getHomepageFeaturedCollectionLabel(slot.ref.relationTo),
        reason: 'not_found',
      })
      continue
    }

    if (!allowDrafts && candidate.status !== 'published') {
      invalidItems.push({
        slot: slot.slot,
        relationTo: candidate.relationTo,
        id: candidate.id,
        collectionLabel: candidate.collectionLabel,
        reason: 'not_published',
      })
      continue
    }

    items.push({
      ...candidate,
      slot: slot.slot,
    })
  }

  return {
    items,
    invalidItems,
    allowDrafts,
    isComplete:
      items.length === totalSlots &&
      invalidItems.length === 0 &&
      parsedSlots.length === totalSlots,
    totalSlots,
  }
}

/** API selection shape for `newsletter-signup` blocks (no curated items). */
export function getNewsletterSignupPlaceholderSelection(
  options?: HomepageFeaturedPlaceholderOptions,
): HomepageFeaturedSelection {
  return {
    items: [],
    invalidItems: [],
    allowDrafts: options?.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts,
    isComplete: true,
    totalSlots: 0,
  }
}
