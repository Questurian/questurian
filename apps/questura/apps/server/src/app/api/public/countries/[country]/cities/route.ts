import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'

type LocationDoc = {
  id: number | string
  locationKey?: string | null
  parentKey?: string | null
  level?: string | null
  countryName?: string | null
  cityName?: string | null
  city?: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function citySlug(location: LocationDoc): string | null {
  if (typeof location.city === 'string' && location.city.trim()) return location.city.trim()
  if (typeof location.locationKey !== 'string') return null

  const [, city] = location.locationKey.split('|')
  return city || null
}

// GET /api/public/countries/[country]/cities
// Lists city pages for a country hub.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ country: string }> },
) {
  try {
    const { country } = await params
    const payload = await getPayload({ config })

    const countryResult = await payload.find({
      collection: 'locations',
      where: {
        and: [
          { level: { equals: 'country' } },
          { locationKey: { equals: country } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (countryResult.totalDocs === 0) {
      return NextResponse.json({ message: 'Country not found.' }, { status: 404 })
    }

    const countryDoc = countryResult.docs[0] as LocationDoc
    const cityResult = await payload.find({
      collection: 'locations',
      where: {
        and: [
          { level: { equals: 'city' } },
          { parentKey: { equals: country } },
        ],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    const cities = (cityResult.docs as LocationDoc[]).filter((location) => citySlug(location))

    if (cities.length === 0) {
      return NextResponse.json({ message: 'No cities found.' }, { status: 404 })
    }

    const publicCities = cities
      .map((location) => {
        const slug = citySlug(location) as string
        return {
          slug,
          name: location.cityName ?? null,
          href: `/${country}/${slug}`,
        }
      })
      .sort((a, b) => (a.name ?? a.slug).localeCompare(b.name ?? b.slug))

    return NextResponse.json({
      country: {
        slug: country,
        name: countryDoc.countryName ?? null,
      },
      cities: publicCities,
    })
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load country cities.') },
      { status: 500 },
    )
  }
}
