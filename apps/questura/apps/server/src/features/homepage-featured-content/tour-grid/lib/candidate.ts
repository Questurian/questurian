import type { HomepageTourCandidate, TourDocLike } from '../types'

import {
  httpUrl,
  imageFromMediaSet,
  isRecord,
  normalizeReferenceCardCandidate,
  sortReferenceCandidates,
  text,
  type ReferenceCardHighlight,
} from '../../reference-grid/candidate'

const BOOKING_PROVIDERS: { host: string; label: string }[] = [
  { host: 'viator.com', label: 'Viator' },
  { host: 'getyourguide.com', label: 'GetYourGuide' },
  { host: 'airbnb.com', label: 'Airbnb Experiences' },
  { host: 'tripadvisor.com', label: 'Tripadvisor' },
  { host: 'civitatis.com', label: 'Civitatis' },
  { host: 'klook.com', label: 'Klook' },
  { host: 'headout.com', label: 'Headout' },
  { host: 'tiqets.com', label: 'Tiqets' },
]

function tourPlace(doc: TourDocLike): string | null {
  if (!isRecord(doc.locationRef)) return null
  return text(doc.locationRef.neighborhoodName) || text(doc.locationRef.cityName)
}

function bookingProvider(bookingUrl: string | null): ReferenceCardHighlight | null {
  if (!bookingUrl) return null
  let host = ''
  try {
    host = new URL(bookingUrl).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
  const match = BOOKING_PROVIDERS.find(
    (provider) => host === provider.host || host.endsWith(`.${provider.host}`),
  )
  if (!match) return null
  return { key: 'provider', label: match.label }
}

export function formatTourPrice(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  if (/^from\b/i.test(raw)) {
    return raw.replace(/^from/i, 'From')
  }
  const match = raw.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/)
  if (!match?.[1]) return raw
  const amount = match[1].replace(/\.00$/, '')
  return `From $${amount}`
}

export function normalizeTourCandidate(doc: TourDocLike): HomepageTourCandidate {
  const bookingUrl = httpUrl(doc.bookingLink)
  const provider = bookingProvider(bookingUrl)
  return {
    ...normalizeReferenceCardCandidate(doc, {
      slug: () => bookingUrl,
      type: () => null,
      priceLevel: (value) => formatTourPrice(value.price),
      image: (value) => imageFromMediaSet(value.img),
      location: tourPlace,
    }),
    highlights: provider ? [provider] : [],
    bookingUrl,
  }
}

export function sortTours(left: HomepageTourCandidate, right: HomepageTourCandidate): number {
  return sortReferenceCandidates(left, right)
}

export { normalizeNumericId } from '../../reference-grid/candidate'
