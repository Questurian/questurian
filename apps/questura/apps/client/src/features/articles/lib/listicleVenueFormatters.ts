/** Dining / venue fields for listicle detail UI */

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeAddressText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripVenueNamePrefix(address: string, venueTitle?: string): string {
  const normalizedAddress = normalizeAddressText(address)
  const normalizedTitle = normalizeAddressText(venueTitle ?? '')
  if (!normalizedAddress || !normalizedTitle) {
    return normalizedAddress
  }

  const parts = normalizedAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 2) {
    return normalizedAddress
  }

  const firstPart = normalizeComparableText(parts[0] ?? '')
  const title = normalizeComparableText(normalizedTitle)
  if (!firstPart || !title) {
    return normalizedAddress
  }

  if (
    firstPart === title ||
    firstPart.startsWith(title) ||
    title.startsWith(firstPart)
  ) {
    return parts.slice(1).join(', ')
  }

  return normalizedAddress
}

export function formatListicleAddressLabel(
  address?: string,
  venueTitle?: string,
): string | null {
  const raw = address?.trim()
  if (!raw) {
    return null
  }

  if (!isHttpUrl(raw)) {
    return normalizeAddressText(raw)
  }

  try {
    const url = new URL(raw)
    const candidate =
      url.searchParams.get('query') ??
      url.searchParams.get('q') ??
      url.searchParams.get('destination') ??
      url.searchParams.get('daddr')

    if (candidate) {
      return stripVenueNamePrefix(candidate, venueTitle)
    }

    if (url.pathname.includes('/maps/place/')) {
      const placeSegment = url.pathname.split('/maps/place/')[1]?.split('/')[0]
      if (placeSegment) {
        return stripVenueNamePrefix(
          decodeURIComponent(placeSegment.replace(/\+/g, ' ')),
          venueTitle,
        )
      }
    }
  } catch {
    return null
  }

  return null
}

export function formatListiclePhone(
  countryCode?: string | null,
  phoneNumber?: string | null,
): string | null {
  const num = phoneNumber?.trim()
  if (!num) {
    return null
  }
  const cc = countryCode?.trim()
  if (cc) {
    return `${cc} ${num}`.replace(/\s+/g, ' ')
  }
  return num
}

export type ListicleHoursRow = { day: string; hours: string }

export function parseListicleOperationHoursRows(
  raw: unknown,
): ListicleHoursRow[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const hours = (raw as { hours?: unknown }).hours
  if (!Array.isArray(hours) || hours.length === 0) {
    return null
  }
  const rows: ListicleHoursRow[] = []
  for (const row of hours) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const day = (row as { day?: unknown }).day
    const h = (row as { hours?: unknown }).hours
    if (typeof day !== 'string' || typeof h !== 'string') {
      continue
    }
    const d = day.trim()
    const hs = h.trim()
    if (!d || !hs) {
      continue
    }
    rows.push({ day: d, hours: hs })
  }
  return rows.length > 0 ? rows : null
}

export function formatListicleOperationHours(raw: unknown): string | null {
  const rows = parseListicleOperationHoursRows(raw)
  if (!rows || rows.length === 0) {
    return null
  }
  if (rows.length === 1) {
    return `${rows[0].day}: ${rows[0].hours}`
  }
  return rows.map((r) => `${r.day}: ${r.hours}`).join(' · ')
}
