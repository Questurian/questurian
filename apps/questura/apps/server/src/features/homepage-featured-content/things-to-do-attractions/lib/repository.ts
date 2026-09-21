import type { Payload } from 'payload'

import type { HomepageHotelCandidate, HomepageHotelItemRef } from '../../types'
import type { AttractionDocLike } from '../types'

import { ATTRACTION_ROOT_SELECT, HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import {
  prefetchDocuments,
  readDocumentBySpec,
  type DocumentReadSpec,
} from '../../reference-grid/page-read-budget'
import { normalizeAttractionCandidate } from './candidate'

/** One shape for the single read and the batch; the key names the shape. */
export const attractionReadSpec: DocumentReadSpec = {
  collection: 'attractions',
  key: (id) => `attraction:${id}`,
  depth: 2,
  select: ATTRACTION_ROOT_SELECT,
  populate: HOMEPAGE_BLOCK_POPULATE,
  normalize: (doc) => normalizeAttractionCandidate(doc as AttractionDocLike),
}

export function findAttractionDoc(
  payload: Payload,
  ref: HomepageHotelItemRef,
): Promise<HomepageHotelCandidate | null> {
  return readDocumentBySpec(payload as never, attractionReadSpec, ref.id)
}

export function prefetchAttractionDocs(payload: Payload, refs: HomepageHotelItemRef[]): Promise<void> {
  return prefetchDocuments(payload as never, attractionReadSpec, refs.map((ref) => ref.id))
}
