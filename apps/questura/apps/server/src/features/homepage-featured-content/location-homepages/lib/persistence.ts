import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PayloadInstance } from '@/types'

import {
  formatHomepageDoc,
  resolveLocationGridScope,
  resolvePageBlocks,
  type LocationHomepageDoc,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import type { FormattedLocationHomepage } from '../types'

export async function getLocationHomepagePayload(): Promise<PayloadInstance> {
  return getPayload({ config })
}

export async function loadLocationHomepage(
  payload: PayloadInstance,
  id: string,
  depth: 0 | 1,
): Promise<LocationHomepageDoc> {
  return (await payload.findByID({
    collection: 'location-homepages',
    id,
    depth,
    overrideAccess: true,
  })) as unknown as LocationHomepageDoc
}

export async function updateLocationHomepage(
  payload: PayloadInstance,
  id: string,
  pageBlocks: unknown[],
  depth: 0 | 1,
): Promise<LocationHomepageDoc> {
  return (await payload.update({
    collection: 'location-homepages',
    id,
    data: { pageBlocks } as any,
    depth,
    overrideAccess: true,
  })) as unknown as LocationHomepageDoc
}

export async function deleteLocationHomepageDocument(
  payload: PayloadInstance,
  id: string,
): Promise<void> {
  await payload.delete({
    collection: 'location-homepages',
    id,
    overrideAccess: true,
  })
}

export async function formatLocationHomepageWithResolvedBlocks(
  payload: PayloadInstance,
  doc: LocationHomepageDoc,
): Promise<FormattedLocationHomepage> {
  const locationGridScope = await resolveLocationGridScope(payload, doc.location)
  const resolvedBlocks = await resolvePageBlocks(
    payload,
    (doc.pageBlocks ?? []) as RawBlock[],
    locationGridScope,
  )

  return formatHomepageDoc(doc, resolvedBlocks)
}

export async function updateAndFormatLocationHomepageBlocks(
  payload: PayloadInstance,
  id: string,
  pageBlocks: unknown[],
  depth: 0 | 1,
): Promise<FormattedLocationHomepage> {
  const updated = await updateLocationHomepage(payload, id, pageBlocks, depth)
  return formatLocationHomepageWithResolvedBlocks(payload, updated)
}
