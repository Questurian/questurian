import type { Payload } from 'payload'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedItemRef,
  PayloadDocLike,
} from '../types'

import { HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import { readDocumentOnce } from '../../reference-grid/page-read-budget'
import { normalizeHomepageFeaturedCandidate } from './candidate'
import { whenNotFound } from '@/shared/lib/not-found-error'

export const homepageFeaturedSelect = {
  id: true,
  title: true,
  slug: true,
  canonicalPath: true,
  location: true,
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
  // The same article can sit in two placements on one page, and this read
  // populates featuredImage -> mediaSet -> variants three levels deep.
  return readDocumentOnce(`featured:${ref.relationTo}:${ref.id}`, async () => {
    try {
      const doc = await payload.findByID({
        collection: ref.relationTo,
        id: ref.id,
        // Populate featuredImage → mediaSet → variants.square for `imageUrlSquare`
        depth: 3,
        overrideAccess: true,
        select: homepageFeaturedSelect,
        populate: HOMEPAGE_BLOCK_POPULATE,
      })

      return normalizeHomepageFeaturedCandidate(ref.relationTo, doc as PayloadDocLike)
    } catch (error) {
      // Deleted is omitted; failed is an error (shared/lib/not-found-error.ts).
      return whenNotFound(error, null)
    }
  })
}
