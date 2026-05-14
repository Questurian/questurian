import type { Payload } from 'payload'
import { locationIdentitySelect } from '@/shared/location/constants'
import type { LocationInput } from '../types'

export const findLocationByKey = async (payload: Payload, locationKey: string) => {
  const result = await payload.find({
    collection: 'locations',
    where: {
      locationKey: {
        equals: locationKey,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: locationIdentitySelect,
  })

  return result.docs?.[0] ?? null
}

export const createLocationIfMissing = async (
  payload: Payload,
  locationKey: string,
  data: LocationInput,
) => {
  const existing = await findLocationByKey(payload, locationKey)
  if (existing) return existing

  const normalizedData = {
    ...data,
    country: data.country ?? undefined,
    city: data.city ?? undefined,
    neighborhood: data.neighborhood ?? undefined,
    countryName: data.countryName ?? undefined,
    cityName: data.cityName ?? undefined,
    neighborhoodName: data.neighborhoodName ?? undefined,
    parentKey: data.parentKey ?? undefined,
  }

  return payload.create({
    collection: 'locations',
    data: normalizedData as any,
    draft: false,
    overrideAccess: true,
  } as any)
}
