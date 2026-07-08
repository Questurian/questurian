import {
  resolveMediaSetForPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

import { isRecord, normalizeNumericId } from './refs'

export type ReferenceCardCandidate = {
  id: number
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  /** @deprecated Read `image.url` instead. Kept for back-compat. */
  imageUrl: string | null
  image: PublicImage | null
  location: string | null
}

export type ReferenceCardCandidateConfig<TDoc> = {
  slug: (doc: TDoc) => string | null
  type: (doc: TDoc) => string | null
  priceLevel: (doc: TDoc) => string | null
  image: (doc: TDoc) => PublicImage | null
  location: (doc: TDoc) => string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function imageFromMediaSet(value: unknown): PublicImage | null {
  if (!isRecord(value)) return null
  const resolved = resolveMediaSetForPlacement(value, 'card')
  return resolved.url ? resolved : null
}

export function imageFromFirstGalleryItem(gallery: unknown): PublicImage | null {
  if (!Array.isArray(gallery) || gallery.length === 0) return null
  const first = gallery[0]
  if (!isRecord(first)) return null
  return imageFromMediaSet(first.image)
}

export function locationFromLegacyLocation(value: unknown): string | null {
  if (!isRecord(value)) return null
  return text(value.city) ?? text(value.country) ?? text(value.value)
}

export function normalizeReferenceCardCandidate<
  TDoc extends { id?: unknown; title?: unknown; status?: unknown; updatedAt?: unknown },
>(doc: TDoc, config: ReferenceCardCandidateConfig<TDoc>): ReferenceCardCandidate {
  const image = config.image(doc)
  return {
    id: normalizeNumericId(doc.id) ?? 0,
    title: text(doc.title) ?? 'Untitled',
    slug: config.slug(doc),
    type: config.type(doc),
    priceLevel: config.priceLevel(doc),
    status: text(doc.status),
    updatedAt: text(doc.updatedAt),
    imageUrl: image?.url ?? null,
    image,
    location: config.location(doc),
  }
}

export function sortReferenceCandidates(
  left: { updatedAt: string | null; title: string },
  right: { updatedAt: string | null; title: string },
): number {
  const leftTimestamp = Date.parse(left.updatedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || '') || 0
  if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  return left.title.localeCompare(right.title)
}

export { isRecord, normalizeNumericId }
