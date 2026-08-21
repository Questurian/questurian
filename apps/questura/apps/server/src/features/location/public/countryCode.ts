import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

// The locations collection stores no ISO code, so the menu derives one from the
// display name (and falls back to the slug) purely for picking a flag asset.
countries.registerLocale(enLocale as Parameters<typeof countries.registerLocale>[0])

// Slugs arrive as "united-states" and display names carry typographic
// apostrophes ("Côte d’Ivoire"); the lookup only tolerates spaces and a straight
// apostrophe. Diacritics are handled by the library itself.
function lookupForms(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  const relaxed = trimmed
    .replace(/[‘’]/g, "'")
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return relaxed === trimmed ? [trimmed] : [trimmed, relaxed]
}

/**
 * Best-effort ISO 3166-1 alpha-2 code for a country, uppercase, or null when no
 * match exists. Never throws: an unmatched country simply renders without a flag.
 */
export function resolveCountryCode(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue

    for (const form of lookupForms(candidate)) {
      const code = countries.getSimpleAlpha2Code(form, 'en')
      if (code) return code.toUpperCase()
    }
  }

  return null
}
