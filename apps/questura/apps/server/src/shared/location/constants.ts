export const locationIdentityFields = [
  'id',
  'level',
  'country',
  'city',
  'neighborhood',
  'locationKey',
  'parentKey',
  'countryName',
  'cityName',
  'neighborhoodName',
] as const

export const locationIdentitySelect = {
  id: true,
  level: true,
  country: true,
  city: true,
  neighborhood: true,
  locationKey: true,
  parentKey: true,
  countryName: true,
  cityName: true,
  neighborhoodName: true,
} as const

export const buildLocationOptionsQuery = (page: number, limit: number): string => {
  const params = new URLSearchParams({
    depth: '0',
    limit: String(limit),
    page: String(page),
  })

  for (const field of locationIdentityFields) {
    params.append(`select[${field}]`, 'true')
  }

  return `/api/locations?${params.toString()}`
}
