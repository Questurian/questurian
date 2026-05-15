import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../types'
import type {
  HomepageFeaturedItemRef,
  HomepageFeaturedValidationOptions,
} from '../types'

import { getHomepageFeaturedCollectionLabel } from '../lib/candidate'
import { buildHomepageFeaturedKey, isHomepageFeaturedCollection } from '../lib/refs'
import { findHomepageFeaturedDoc } from '../lib/repository'

async function validateHomepageFeaturedDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
  allowDrafts: boolean,
): Promise<void> {
  const doc = await findHomepageFeaturedDoc(payload, ref)

  if (!doc) {
    throw new Error(
      `${getHomepageFeaturedCollectionLabel(ref.relationTo)} #${ref.id} could not be found.`,
    )
  }

  if (!allowDrafts && doc.status !== 'published') {
    throw new Error(
      `${doc.collectionLabel} "${doc.title}" must be published before it can be featured.`,
    )
  }

  if (!doc.imageUrl) {
    throw new Error(
      `${doc.collectionLabel} "${doc.title}" is missing a featured image. Add a featured image (or media set with the required card variant) before featuring it.`,
    )
  }
}

export async function validateHomepageFeaturedItems(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
  options: HomepageFeaturedValidationOptions = {},
): Promise<HomepageFeaturedItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const keys = new Set<string>()

  for (const ref of refs) {
    if (!isHomepageFeaturedCollection(ref.relationTo)) {
      throw new Error(`Unsupported homepage featured collection: ${String(ref.relationTo)}.`)
    }

    const key = buildHomepageFeaturedKey(ref)
    if (keys.has(key)) {
      throw new Error('Homepage featured content cannot contain duplicate entries.')
    }
    keys.add(key)
  }

  await Promise.all(refs.map((ref) => validateHomepageFeaturedDoc(payload, ref, allowDrafts)))

  return refs
}
