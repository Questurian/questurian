import type { Payload } from 'payload'

import type {
  LocationGridCandidate,
  LocationGridInvalidItem,
  LocationGridSelection,
  LocationGridSelectionOptions,
} from '../types'

import { LOCATION_GRID_MIN_SLOTS } from '../constants'
import { findLocationGridDoc } from '../lib/repository'
import { parseLocationGridSlots } from '../lib/refs'
import { isLocationWithinScope } from '../lib/scope'

export async function getLocationGridSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: LocationGridSelectionOptions,
): Promise<LocationGridSelection> {
  const totalSlots = options.totalSlots ?? LOCATION_GRID_MIN_SLOTS
  const parsedSlots = parseLocationGridSlots(rawItems)
  const items: LocationGridCandidate[] = []
  const invalidItems: LocationGridInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({
        slot: slot.slot,
        reason: slot.reason || 'invalid_reference',
      })
      continue
    }

    const candidate = await findLocationGridDoc(payload, slot.ref)

    if (!candidate) {
      invalidItems.push({
        slot: slot.slot,
        id: slot.ref.id,
        reason: 'not_found',
      })
      continue
    }

    if (!isLocationWithinScope(candidate, options.scope)) {
      invalidItems.push({
        slot: slot.slot,
        id: candidate.id,
        title: candidate.title,
        reason: 'invalid_scope',
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
    isComplete:
      items.length === totalSlots && invalidItems.length === 0 && parsedSlots.length === totalSlots,
    totalSlots,
  }
}
