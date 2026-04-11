import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  buildHomepageFeaturedGlobalData,
  getHomepageFeaturedSelectionFromItems,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'
import { HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT } from './types'

const SINGLE_TYPE_LISTICLES = 'single-type-listicles' as const

export function normalizeQuesturianMapsInput(rawItems: unknown): HomepageFeaturedItemRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== SINGLE_TYPE_LISTICLES)) {
    throw new Error('Questurian Maps blocks only support single-type-listicles.')
  }
  return refs
}

export function buildQuesturianMapsGlobalData(items: HomepageFeaturedItemRef[]) {
  return buildHomepageFeaturedGlobalData(items)
}

export async function validateQuesturianMapsItems(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
  options: { allowDrafts?: boolean; slotCount?: number } = {},
): Promise<HomepageFeaturedItemRef[]> {
  const slotCount = options.slotCount ?? HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts

  for (const ref of refs) {
    if (ref.relationTo !== SINGLE_TYPE_LISTICLES) {
      throw new Error('Questurian Maps blocks only support single-type-listicles.')
    }
  }

  return validateHomepageFeaturedItems(payload, refs, {
    allowDrafts,
    slotCount,
  })
}

export async function getQuesturianMapsSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: { allowDrafts?: boolean; totalSlots?: number } = {},
): Promise<HomepageFeaturedSelection> {
  // Always six slots; ignore stale slotCount from CMS (e.g. after type changes).
  const totalSlots = HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT
  const base = await getHomepageFeaturedSelectionFromItems(payload, rawItems, {
    ...options,
    totalSlots,
  })

  const kept: HomepageFeaturedCandidate[] = []
  const movedToInvalid: HomepageFeaturedInvalidItem[] = []

  for (const item of base.items) {
    if (item.relationTo === SINGLE_TYPE_LISTICLES) {
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
