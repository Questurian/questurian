import type { CollectionBeforeChangeHook, Payload } from 'payload'
import type { LocationInput } from '../types'
import { createLocationIfMissing, findLocationByKey } from '../lib/location-repository'

const ensureParentLocations = async (payload: Payload, data: LocationInput) => {
  if (!data.country) return

  await createLocationIfMissing(payload, data.country, {
    level: 'country',
    country: data.country,
    countryName: data.countryName ?? null,
  })

  if (data.level === 'neighborhood' && data.city) {
    await createLocationIfMissing(payload, `${data.country}|${data.city}`, {
      level: 'city',
      country: data.country,
      city: data.city,
      countryName: data.countryName ?? null,
      cityName: data.cityName ?? null,
    })
  }
}

export const ensureParentLocation: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  if (!data?.parentKey) return data

  const locationData = data as LocationInput
  let parent = await findLocationByKey(req.payload, data.parentKey)

  if (!parent && operation === 'create') {
    await ensureParentLocations(req.payload, locationData)
    parent = await findLocationByKey(req.payload, data.parentKey)
  }

  if (!parent) {
    throw new Error(`parentKey does not reference an existing location: ${data.parentKey}`)
  }

  return data
}
