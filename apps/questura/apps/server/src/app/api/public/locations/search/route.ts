import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'

const MAX_RESULTS = 20

export type LocationSearchItem = {
  locationKey: string
  level: 'country' | 'city' | 'neighborhood'
  label: string
  country: string
  city: string | null
  neighborhood: string | null
}

const LEVEL_ORDER: Record<LocationSearchItem['level'], number> = {
  country: 0,
  city: 1,
  neighborhood: 2,
}

function buildLabel(doc: {
  level: LocationSearchItem['level']
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
  country: string
  city?: string | null
  neighborhood?: string | null
}): string {
  const countryLabel = doc.countryName || doc.country
  if (doc.level === 'country') return countryLabel
  const cityLabel = doc.cityName || doc.city || ''
  if (doc.level === 'city') return `${cityLabel}, ${countryLabel}`
  const neighborhoodLabel = doc.neighborhoodName || doc.neighborhood || ''
  return `${neighborhoodLabel}, ${cityLabel}, ${countryLabel}`
}

// GET /api/public/locations/search?q=bogota
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) {
      return NextResponse.json({ message: 'q must be at least 2 characters' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    const result = await payload.find({
      collection: 'locations',
      where: {
        or: [
          { country: { like: q } },
          { city: { like: q } },
          { neighborhood: { like: q } },
          { countryName: { like: q } },
          { cityName: { like: q } },
          { neighborhoodName: { like: q } },
        ],
      },
      limit: MAX_RESULTS,
      depth: 0,
      overrideAccess: true,
    })

    const items: LocationSearchItem[] = result.docs
      .filter((doc) => typeof doc.locationKey === 'string' && doc.locationKey)
      .map((doc) => ({
        locationKey: doc.locationKey as string,
        level: doc.level as LocationSearchItem['level'],
        label: buildLabel(doc as Parameters<typeof buildLabel>[0]),
        country: doc.country,
        city: doc.city ?? null,
        neighborhood: doc.neighborhood ?? null,
      }))
      .sort(
        (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.label.localeCompare(b.label),
      )

    return NextResponse.json({ items })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Search failed.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
