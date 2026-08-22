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

function publicLocationHref(locationKey: string | null): string | null {
  const parts = locationKey?.split('|').filter(Boolean) ?? []
  return parts.length === 2 || parts.length === 3 ? `/${parts.join('/')}` : null
}

async function resolvePublishedHomepageHref(
  payload: Payload,
  candidate: LocationGridCandidate,
): Promise<string | null> {
  const result = await payload.find({
    collection: 'location-homepages',
    where: {
      and: [
        { location: { equals: candidate.id } },
        { isEnabled: { equals: true } },
        { publishedRevision: { greater_than: 0 } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { publishedPageBlocks: true },
  })
  const homepage = (result as { docs?: Array<{ publishedPageBlocks?: unknown[] }> } | undefined)
    ?.docs?.[0]
  return homepage?.publishedPageBlocks?.length ? publicLocationHref(candidate.locationKey) : null
}

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
      href: await resolvePublishedHomepageHref(payload, candidate),
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
