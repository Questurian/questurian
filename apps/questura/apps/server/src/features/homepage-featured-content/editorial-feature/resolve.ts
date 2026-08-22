import type { PayloadInstance } from '@/types'
import { resolveMediaSetForPlacement } from '@/features/media/lib/resolve-public-image'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function relationshipId(value: unknown): number | null {
  const raw = isRecord(value) ? value.id : value
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function mediaSetHasAuthoredAlt(mediaSet: Record<string, unknown>): boolean {
  if (text(mediaSet.alt_text)) return true
  const variants = isRecord(mediaSet.variants) ? mediaSet.variants : null
  return Boolean(
    variants &&
      ['portrait', 'wide'].every((key) => {
        const asset = isRecord(variants[key]) ? variants[key] : null
        return asset ? text(asset.alt_text) : null
      }),
  )
}

function locationLabel(location: Record<string, unknown>): string {
  return (
    text(location.neighborhoodName) ??
    text(location.cityName) ??
    text(location.countryName) ??
    text(location.locationKey) ??
    'Location'
  )
}

function locationHref(locationKey: string | null): string | null {
  if (!locationKey) return null
  const parts = locationKey.split('|').filter(Boolean)
  return parts.length === 2 || parts.length === 3 ? `/${parts.join('/')}` : null
}

export async function resolveEditorialFeatureFields(
  payload: PayloadInstance,
  block: Record<string, unknown>,
) {
  const mediaSetId = relationshipId(block.featureMediaSet)
  let featureImagePortrait = null
  let featureImageWide = null
  let featureImageAltReady = false

  if (mediaSetId) {
    try {
      const mediaSet = (await payload.findByID({
        collection: 'media-sets',
        id: mediaSetId,
        depth: 1,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      featureImagePortrait = resolveMediaSetForPlacement(mediaSet, 'portrait-card')
      featureImageWide = resolveMediaSetForPlacement(mediaSet, 'wide-card')
      featureImageAltReady = mediaSetHasAuthoredAlt(mediaSet)
    } catch {
      // Missing relationship is represented by null images and publish blockers.
    }
  }

  const linkedLocationId = relationshipId(block.linkedLocation)
  let linkedLocation = null
  let linkWarning: string | null = null

  if (linkedLocationId) {
    try {
      const location = (await payload.findByID({
        collection: 'locations',
        id: linkedLocationId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      const homepageResult = await payload.find({
        collection: 'location-homepages',
        where: {
          and: [
            { location: { equals: linkedLocationId } },
            { isEnabled: { equals: true } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const homepage = homepageResult.docs[0] as unknown as Record<string, unknown> | undefined
      const publishedBlocks = homepage?.publishedPageBlocks
      const isLinkable =
        Number(homepage?.publishedRevision) > 0 &&
        Array.isArray(publishedBlocks) &&
        publishedBlocks.length > 0
      const key = text(location.locationKey)
      const href = isLinkable ? locationHref(key) : null

      linkedLocation = {
        id: linkedLocationId,
        label: locationLabel(location),
        locationKey: key,
        href,
        isLinkable: Boolean(href),
      }
      if (!href) linkWarning = 'Selected Location does not have an enabled, published homepage.'
    } catch {
      linkWarning = 'Selected Location no longer exists.'
    }
  }

  return {
    featureKicker: text(block.featureKicker),
    featureTitle: text(block.featureTitle),
    featureDescription: text(block.featureDescription),
    featureMediaSetId: mediaSetId,
    featureImagePortrait,
    featureImageWide,
    featureImageAltReady,
    linkedLocationId,
    linkedLocation,
    linkWarning,
  }
}
