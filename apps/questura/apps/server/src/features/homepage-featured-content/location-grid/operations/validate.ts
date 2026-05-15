import type { Payload } from 'payload'

import type {
  LocationGridItemRef,
  LocationGridScope,
  LocationGridValidationOptions,
} from '../types'

import { LOCATION_GRID_MIN_SLOTS } from '../constants'
import { findLocationGridDoc } from '../lib/repository'
import { getScopedLocationLabel, isLocationWithinScope } from '../lib/scope'

async function validateLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
  scope: LocationGridScope,
): Promise<void> {
  const candidate = await findLocationGridDoc(payload, ref)

  if (!candidate) {
    throw new Error(`Location #${ref.id} could not be found.`)
  }

  if (!isLocationWithinScope(candidate, scope)) {
    throw new Error(
      `Location "${candidate.title}" is not an eligible ${getScopedLocationLabel(scope)} for this block.`,
    )
  }

  if (!candidate.coverImageUrl) {
    throw new Error(
      `Location "${candidate.title}" is missing a cover image card variant. Add a media set with the required card variant before featuring it.`,
    )
  }
}

export async function validateLocationGridItems(
  payload: Payload,
  refs: LocationGridItemRef[],
  options: LocationGridValidationOptions,
): Promise<LocationGridItemRef[]> {
  const slotCount = options.slotCount ?? LOCATION_GRID_MIN_SLOTS
  const scope = options.scope

  if (!scope) {
    throw new Error('Location Grid blocks are only available on city homepages.')
  }

  if (refs.length !== slotCount) {
    throw new Error(
      `This block requires exactly ${slotCount} location${slotCount === 1 ? '' : 's'}.`,
    )
  }

  const keys = new Set<string>()

  for (const ref of refs) {
    const key = String(ref.id)
    if (keys.has(key)) {
      throw new Error('Location Grid cannot contain duplicate locations.')
    }
    keys.add(key)
  }

  await Promise.all(refs.map((ref) => validateLocationGridDoc(payload, ref, scope)))

  return refs
}
