import type { Payload } from 'payload'

import type { LocationDocLike, LocationGridCandidate, LocationGridItemRef } from '../types'

import { locationGridSelect } from '../constants'
import { HOMEPAGE_BLOCK_POPULATE } from '../../populate'
import {
  prefetchDocuments,
  readDocumentBySpec,
  type DocumentReadSpec,
} from '../../reference-grid/page-read-budget'
import { normalizeLocationGridCandidate } from './candidate'

/** One shape for the single read and the batch; the key names the shape. */
export const locationGridReadSpec: DocumentReadSpec = {
  collection: 'locations',
  key: (id) => `location-grid:${id}`,
  depth: 2,
  select: locationGridSelect,
  populate: HOMEPAGE_BLOCK_POPULATE,
  normalize: (doc) => normalizeLocationGridCandidate(doc as LocationDocLike),
}

export function findLocationGridDoc(
  payload: Payload,
  ref: LocationGridItemRef,
): Promise<LocationGridCandidate | null> {
  return readDocumentBySpec(payload as never, locationGridReadSpec, ref.id)
}

export function prefetchLocationGridDocs(payload: Payload, refs: LocationGridItemRef[]): Promise<void> {
  return prefetchDocuments(payload as never, locationGridReadSpec, refs.map((ref) => ref.id))
}
