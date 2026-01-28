import type { CollectionSlug, Payload } from 'payload'

type LocationReferenceTarget = {
  slug: CollectionSlug
  label: string
}

export const LOCATION_REFERENCE_TARGETS: LocationReferenceTarget[] = [
  { slug: 'media-assets', label: 'Media Assets' },
  { slug: 'media-sets', label: 'Media Sets' },
  { slug: 'dining', label: 'Dining' },
  { slug: 'accommodations', label: 'Accommodations' },
  { slug: 'nightlife', label: 'Nightlife' },
  { slug: 'attractions', label: 'Attractions' },
  { slug: 'rankings', label: 'Rankings' },
  { slug: 'itineraries', label: 'Itineraries' },
  { slug: 'articles', label: 'Articles' },
]

export const findLocationReferences = async (
  payload: Payload,
  locationKey: string,
  locationId?: string | number | null
) => {
  const references = new Set<string>()

  for (const target of LOCATION_REFERENCE_TARGETS) {
    const byKey = await payload.find({
      collection: target.slug,
      where: {
        location: {
          equals: locationKey,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (byKey.totalDocs > 0) {
      references.add(target.label)
    }

    if (locationId !== undefined && locationId !== null) {
      const byRef = await payload.find({
        collection: target.slug,
        where: {
          locationRef: {
            equals: locationId,
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (byRef.totalDocs > 0) {
        references.add(target.label)
      }
    }
  }

  return Array.from(references)
}
