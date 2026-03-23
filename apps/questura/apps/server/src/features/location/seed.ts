import type { Payload } from 'payload'

const LOCATIONS = [
  {
    level: 'country' as const,
    country: 'peru',
    countryName: 'Peru',
    locationKey: 'peru',
  },
  {
    level: 'city' as const,
    country: 'peru',
    city: 'lima',
    countryName: 'Peru',
    cityName: 'Lima',
    locationKey: 'peru|lima',
    parentKey: 'peru',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'miraflores',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Miraflores',
    locationKey: 'peru|lima|miraflores',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Barranco',
    locationKey: 'peru|lima|barranco',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'san-isidro',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'San Isidro',
    locationKey: 'peru|lima|san-isidro',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'surco',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Santiago de Surco',
    locationKey: 'peru|lima|surco',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'san-borja',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'San Borja',
    locationKey: 'peru|lima|san-borja',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'lima-centro',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Lima Centro',
    locationKey: 'peru|lima|lima-centro',
    parentKey: 'peru|lima',
  },
  {
    level: 'neighborhood' as const,
    country: 'peru',
    city: 'lima',
    neighborhood: 'magdalena-del-mar',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Magdalena del Mar',
    locationKey: 'peru|lima|magdalena-del-mar',
    parentKey: 'peru|lima',
  },
]

export const SEED_LOCATION_KEYS = new Set(LOCATIONS.map((l) => l.locationKey))

export async function seedLocations(payload: Payload): Promise<void> {
  console.log('Seeding locations...')

  for (const loc of LOCATIONS) {
    const existing = await payload.find({
      collection: 'locations',
      where: { locationKey: { equals: loc.locationKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as any)

    if (existing.docs[0]) {
      console.log(`  ↺ Already exists: ${loc.locationKey}`)
      continue
    }

    await payload.create({
      collection: 'locations',
      data: loc as any,
      overrideAccess: true,
    })

    console.log(`  ✓ Created: ${loc.locationKey}`)
  }

  console.log(`\n✓ Location seeding complete (${LOCATIONS.length} records)`)
}
