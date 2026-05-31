import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PayloadInstance } from '@/types'

import {
  formatHomepageDoc,
  resolveLocationGridScope,
  resolvePageBlocks,
  type LocationDoc,
  type LocationHomepageDoc,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import { augmentBlocksWithPublishStatus } from './publish-status'
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
    data: { draftPageBlocks: pageBlocks } as any,
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
  const location = await resolveLocationForFormat(payload, doc.location)
  const draftBlocks = getDraftPageBlocks(doc)
  const publishedBlocks = getPublishedPageBlocks(doc)
  const resolvedDraft = await resolvePageBlocks(payload, draftBlocks, locationGridScope)
  const resolvedPublished = await resolvePageBlocks(payload, publishedBlocks, locationGridScope)
  const augmentedDraft = augmentBlocksWithPublishStatus(
    resolvedDraft,
    draftBlocks,
    publishedBlocks,
  )

  return formatHomepageDoc({ ...doc, location }, augmentedDraft, {
    publishedPageBlocks: resolvedPublished,
  })
}

async function resolveLocationForFormat(
  payload: PayloadInstance,
  rawLocation: LocationHomepageDoc['location'],
): Promise<LocationDoc | null> {
  if (typeof rawLocation === 'object' && rawLocation !== null) {
    return rawLocation
  }

  if (!rawLocation) {
    return null
  }

  return (await payload.findByID({
    collection: 'locations',
    id: rawLocation,
    depth: 0,
    overrideAccess: true,
    select: {
      id: true,
      locationKey: true,
      level: true,
      countryName: true,
      cityName: true,
      neighborhoodName: true,
    },
  })) as LocationDoc
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

export function getDraftPageBlocks(doc: LocationHomepageDoc): RawBlock[] {
  return (doc.draftPageBlocks ?? doc.pageBlocks ?? []) as RawBlock[]
}

export function getPublishedPageBlocks(doc: LocationHomepageDoc): RawBlock[] {
  return (doc.publishedPageBlocks ?? doc.pageBlocks ?? []) as RawBlock[]
}
