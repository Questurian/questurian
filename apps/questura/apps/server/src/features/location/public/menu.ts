export type LocationMenuLevel = 'country' | 'city' | 'neighborhood'

export type LocationMenuLocationDoc = {
  id?: unknown
  level?: unknown
  locationKey?: unknown
  parentKey?: unknown
  country?: unknown
  city?: unknown
  countryName?: unknown
  cityName?: unknown
}

export type PublicLocationMenuCity = {
  locationKey: string
  label: string
  href: string
}

export type PublicLocationMenuCountry = {
  locationKey: string
  label: string
  href: string
  cities: PublicLocationMenuCity[]
}

export type PublicLocationMenuResponse = {
  countries: PublicLocationMenuCountry[]
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function countrySlug(doc: LocationMenuLocationDoc): string | null {
  return stringOrNull(doc.country) ?? stringOrNull(doc.locationKey)?.split('|')[0] ?? null
}

function citySlug(doc: LocationMenuLocationDoc): string | null {
  return stringOrNull(doc.city) ?? stringOrNull(doc.locationKey)?.split('|')[1] ?? null
}

function countryLabel(doc: LocationMenuLocationDoc, fallback: string): string {
  return stringOrNull(doc.countryName) ?? stringOrNull(doc.country) ?? fallback
}

function cityLabel(doc: LocationMenuLocationDoc, fallback: string): string {
  return stringOrNull(doc.cityName) ?? stringOrNull(doc.city) ?? fallback
}

function ensureCountry(
  map: Map<string, PublicLocationMenuCountry>,
  key: string,
  label: string,
): PublicLocationMenuCountry {
  const existing = map.get(key)
  if (existing) return existing

  const country: PublicLocationMenuCountry = {
    locationKey: key,
    label,
    href: `/${key}`,
    cities: [],
  }
  map.set(key, country)
  return country
}

export function buildPublicLocationMenu(
  countryDocs: LocationMenuLocationDoc[],
  cityDocs: LocationMenuLocationDoc[],
): PublicLocationMenuResponse {
  const countriesByKey = new Map<string, PublicLocationMenuCountry>()

  for (const doc of countryDocs) {
    if (doc.level !== 'country') continue

    const key = stringOrNull(doc.locationKey) ?? countrySlug(doc)
    if (!key) continue

    ensureCountry(countriesByKey, key, countryLabel(doc, key))
  }

  for (const location of cityDocs) {
    if (location.level !== 'city') continue

    const key = stringOrNull(location.locationKey)
    const country = countrySlug(location)
    const city = citySlug(location)
    if (!key || !country || !city) continue

    const countryItem = ensureCountry(countriesByKey, country, countryLabel(location, country))
    if (countryItem.cities.some((item) => item.locationKey === key)) continue

    countryItem.cities.push({
      locationKey: key,
      label: cityLabel(location, city),
      href: `/${country}/${city}`,
    })
  }

  const countries = [...countriesByKey.values()]
  for (const country of countries) {
    country.cities.sort((a, b) => a.label.localeCompare(b.label))
  }

  countries.sort((a, b) => a.label.localeCompare(b.label))

  return { countries }
}
