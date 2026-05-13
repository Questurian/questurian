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
  const parsedSlots = parseHomepageFeaturedSlots(rawItems)
  const items: HomepageFeaturedCandidate[] = []
  const invalidItems: HomepageFeaturedInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({
        slot: slot.slot,
        reason: slot.reason || 'invalid_reference',
      })
      continue
    }

    const candidate = await findHomepageFeaturedDoc(payload, slot.ref)

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
