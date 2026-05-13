import type { Payload } from 'payload'

import { getHomepageFeaturedSelectionFromItems } from '../../featured-articles/service'
import type {
  HomepageThingsToDoListiclesSelection,
  ThingsToDoListiclesSelectionOptions,
} from '../types'

import {
  THINGS_TO_DO_LISTICLES_COLLECTION,
  THINGS_TO_DO_LISTICLES_LISTICLE_TYPE,
} from '../constants'
import { toRefKey } from '../lib/candidate'

export async function getThingsToDoListiclesSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: ThingsToDoListiclesSelectionOptions = {},
): Promise<HomepageThingsToDoListiclesSelection> {
  const selection = await getHomepageFeaturedSelectionFromItems(payload, rawItems, options)
  if (selection.items.length === 0) return selection

  const allowedIds = new Set<number>()
  for (const item of selection.items) {
    if (item.relationTo !== THINGS_TO_DO_LISTICLES_COLLECTION) continue
    allowedIds.add(item.id)
  }

  const docs =
    allowedIds.size > 0
      ? await payload.find({
          collection: THINGS_TO_DO_LISTICLES_COLLECTION,
          depth: 0,
          limit: Math.max(allowedIds.size, 1),
          page: 1,
          where: {
            and: [
              { id: { in: [...allowedIds] } },
              { listicleType: { equals: THINGS_TO_DO_LISTICLES_LISTICLE_TYPE } },
            ],
          },
          overrideAccess: true,
        })
      : { docs: [] as Array<{ id?: unknown }> }

  const validIds = new Set(
    (docs.docs || [])
      .map((doc) => (typeof doc.id === 'number' ? doc.id : Number(doc.id)))
      .filter((id) => Number.isFinite(id)),
  )

  const items = selection.items.filter(
    (item) => item.relationTo === THINGS_TO_DO_LISTICLES_COLLECTION && validIds.has(item.id),
  )
  const removedKeys = new Set(
    selection.items
      .filter(
        (item) =>
          !items.some((next) => next.relationTo === item.relationTo && next.id === item.id),
      )
      .map((item) => toRefKey(item)),
  )

  const invalidItems = [
    ...selection.invalidItems,
    ...selection.items
      .filter((item) => removedKeys.has(toRefKey(item)))
      .map((item) => ({
        slot: item.slot ?? 0,
        relationTo: item.relationTo,
        id: item.id,
        collectionLabel: item.collectionLabel,
        reason: 'invalid_reference' as const,
      })),
  ]

  return {
    ...selection,
    items,
    invalidItems,
    isComplete: items.length === selection.totalSlots && invalidItems.length === 0,
  }
}
