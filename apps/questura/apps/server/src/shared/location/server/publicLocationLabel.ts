/**
 * The reader-facing name of a location, e.g. "Lima, Peru".
 *
 * Two public endpoints hand this string to the client and the client puts it
 * straight in a <title>: /api/public/articles/by-location and
 * /api/public/location-homepages/[country]/[city]. They have to agree, or the
 * same city gets two different titles depending on which one answered.
 *
 * The display columns win over the slugs. They are what an editor types, so
 * they carry the accents and the casing the slug threw away ("Medellín", not
 * "Medellin"). Never rebuild this label from the URL.
 */

export type PublicLocationLabelSource = {
  level?: string | null
  country?: string | null
  city?: string | null
  neighborhood?: string | null
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
}

export function publicLocationLabel(location: PublicLocationLabelSource): string {
  const country = location.countryName || location.country
  const city = location.cityName || location.city
  const neighborhood = location.neighborhoodName || location.neighborhood

  if (location.level === 'country') return `${country}`
  if (location.level === 'city') return `${city}, ${country}`
  return `${neighborhood}, ${city}, ${country}`
}
