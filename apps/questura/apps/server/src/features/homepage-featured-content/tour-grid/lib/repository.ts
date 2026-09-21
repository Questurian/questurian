import type { Payload } from 'payload'

import type { HomepageTourCandidate, HomepageTourItemRef, TourDocLike } from '../types'

import { HOMEPAGE_BLOCK_POPULATE, TOUR_ROOT_SELECT } from '../../populate'
import {
  prefetchDocuments,
  readDocumentBySpec,
  type DocumentReadSpec,
} from '../../reference-grid/page-read-budget'
import { normalizeTourCandidate } from './candidate'

/** One shape for the single read and the batch; the key names the shape. */
export const tourReadSpec: DocumentReadSpec = {
  collection: 'tours',
  key: (id) => `tour:${id}`,
  depth: 2,
  select: TOUR_ROOT_SELECT,
  populate: HOMEPAGE_BLOCK_POPULATE,
  normalize: (doc) => normalizeTourCandidate(doc as TourDocLike),
}

export function findTourDoc(payload: Payload, ref: HomepageTourItemRef): Promise<HomepageTourCandidate | null> {
  return readDocumentBySpec(payload as never, tourReadSpec, ref.id)
}

export function prefetchTourDocs(payload: Payload, refs: HomepageTourItemRef[]): Promise<void> {
  return prefetchDocuments(payload as never, tourReadSpec, refs.map((ref) => ref.id))
}
