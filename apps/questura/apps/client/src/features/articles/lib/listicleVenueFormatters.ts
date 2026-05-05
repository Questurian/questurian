/** Dining / venue fields for listicle detail UI */

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function formatListiclePhone(
  countryCode?: string,
  phoneNumber?: string,
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
