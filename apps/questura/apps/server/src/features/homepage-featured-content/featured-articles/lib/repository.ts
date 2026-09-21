import type { Payload } from 'payload'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedItemRef,
  PayloadDocLike,
} from '../types'

import { HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import {
  prefetchDocuments,
  readDocumentBySpec,
  type DocumentReadSpec,
} from '../../reference-grid/page-read-budget'
import { normalizeHomepageFeaturedCandidate } from './candidate'

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

/**
 * One shape per collection for the single read and the batch. Populates
 * featuredImage → mediaSet → variants.square for `imageUrlSquare`.
 */
export function homepageFeaturedReadSpec(relationTo: HomepageFeaturedItemRef['relationTo']): DocumentReadSpec {
  return {
    collection: relationTo,
    key: (id) => `featured:${relationTo}:${id}`,
    depth: 3,
    select: homepageFeaturedSelect,
    populate: HOMEPAGE_BLOCK_POPULATE,
    normalize: (doc) => normalizeHomepageFeaturedCandidate(relationTo, doc as PayloadDocLike),
  }
}

export function findHomepageFeaturedDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
): Promise<HomepageFeaturedCandidate | null> {
  // The same article can sit in two placements on one page; the request cache
  // reads it once.
  return readDocumentBySpec(payload as never, homepageFeaturedReadSpec(ref.relationTo), ref.id)
}

/** One query per collection for every featured slot on a block. */
export async function prefetchHomepageFeaturedDocs(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
): Promise<void> {
  const byCollection = new Map<HomepageFeaturedItemRef['relationTo'], Array<string | number>>()
  for (const ref of refs) {
    byCollection.set(ref.relationTo, [...(byCollection.get(ref.relationTo) ?? []), ref.id])
  }
  await Promise.all(
    [...byCollection].map(([relationTo, ids]) =>
      prefetchDocuments(payload as never, homepageFeaturedReadSpec(relationTo), ids),
    ),
  )
}
