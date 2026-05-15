import type { Payload } from 'payload'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedItemRef,
  PayloadDocLike,
} from '../types'

import { normalizeHomepageFeaturedCandidate } from './candidate'

export const homepageFeaturedSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  updatedAt: true,
  publishedAt: true,
  headerSection: true,
  header: true,
  seoSection: true,
  author: true,
  category: true,
} as const

export async function findHomepageFeaturedDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
): Promise<HomepageFeaturedCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: ref.relationTo,
      id: ref.id,
      // Populate featuredImage → mediaSet → variants.square for `imageUrlSquare`
      depth: 3,
      overrideAccess: true,
      select: homepageFeaturedSelect,
    })

    return normalizeHomepageFeaturedCandidate(ref.relationTo, doc as PayloadDocLike)
  } catch {
    return null
  }
}
