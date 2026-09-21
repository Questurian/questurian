import type { Payload } from 'payload'

import type { AccommodationDocLike, HomepageHotelCandidate, HomepageHotelItemRef } from '../types'

import { ACCOMMODATION_ROOT_SELECT, HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import {
  prefetchDocuments,
  readDocumentBySpec,
  type DocumentReadSpec,
} from '../../reference-grid/page-read-budget'
import { normalizeHotelCandidate } from './candidate'

/** One shape for the single read and the batch; the key names the shape. */
export const hotelReadSpec: DocumentReadSpec = {
  collection: 'accommodations',
  key: (id) => `hotel:${id}`,
  depth: 2,
  select: ACCOMMODATION_ROOT_SELECT,
  populate: HOMEPAGE_BLOCK_POPULATE,
  normalize: (doc) => normalizeHotelCandidate(doc as AccommodationDocLike),
}

export function findHotelDoc(payload: Payload, ref: HomepageHotelItemRef): Promise<HomepageHotelCandidate | null> {
  return readDocumentBySpec(payload as never, hotelReadSpec, ref.id)
}

export function prefetchHotelDocs(payload: Payload, refs: HomepageHotelItemRef[]): Promise<void> {
  return prefetchDocuments(payload as never, hotelReadSpec, refs.map((ref) => ref.id))
}
