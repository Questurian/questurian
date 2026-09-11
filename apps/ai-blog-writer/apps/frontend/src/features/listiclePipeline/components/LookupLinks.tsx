import type { ListicleCandidate } from '../types'

/**
 * One click from a place to Google and to Google Maps, in the list's city.
 *
 * Used on every card and again in the duplicate check, where "are these two
 * the same place?" is usually answered by looking both of them up.
 */

/** What to type into Google for this place. Searches sometimes write the
 *  branch into the name ("Wingman [Miraflores]"); the brackets only get in
 *  the way of a search, and the district is added separately anyway. */
export function lookupQuery(candidate: ListicleCandidate, place: string): string {
  const name = candidate.name.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = [name || candidate.name]
  if (candidate.district && !name.toLowerCase().includes(candidate.district.toLowerCase())) {
    parts.push(candidate.district)
  }
  if (place) parts.push(place)
  return parts.join(' ')
}

export function LookupLinks({
  candidate,
  place,
}: {
  candidate: ListicleCandidate
  place: string
}) {
  const query = encodeURIComponent(lookupQuery(candidate, place))
  return (
    <>
      <a
        className="lp-tool"
        href={`https://www.google.com/search?q=${query}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Search Google for ${candidate.name}`}
      >
        <GoogleIcon />
        Google
      </a>
      <a
        className="lp-tool"
        href={`https://www.google.com/maps/search/?api=1&query=${query}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Find ${candidate.name} on Google Maps`}
      >
        <MapsIcon />
        Maps
      </a>
    </>
  )
}

/** Google's own mark, so the button is recognised before it is read. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/** The Maps pin, in Maps red. */
function MapsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 1.75c-4.1 0-7.25 3.12-7.25 7.1 0 5.3 6.24 12.2 6.5 12.49a1 1 0 0 0 1.5 0c.26-.29 6.5-7.19 6.5-12.49 0-3.98-3.15-7.1-7.25-7.1z"
      />
      <circle cx="12" cy="8.9" r="2.6" fill="#A50E0E" />
    </svg>
  )
}
