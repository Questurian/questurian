/**
 * The one way the server writes a date a member reads: in emails and in the
 * messages the payments API returns.
 *
 * A bare `toLocaleDateString()` uses the host's time zone and locale. Railway
 * and Workers run in UTC, a laptop runs in local time, so the same "access
 * ends" instant could read as two different days depending on where the code
 * ran -- and `9/24/2026` means something else to a reader outside the US.
 *
 * The rule: dates are written in UTC with the month spelled out
 * ("October 3, 2026"). Stripe's period boundaries are UTC instants, so UTC is
 * also the only zone in which the date matches Stripe's own receipts.
 */

export const MEMBER_DATE_TIME_ZONE = 'UTC'

const accessDateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: MEMBER_DATE_TIME_ZONE,
})

const timestampFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: MEMBER_DATE_TIME_ZONE,
})

type DateInput = Date | string | number | null | undefined

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "October 3, 2026", in UTC. `null` for a missing or unparseable value. */
export function formatAccessDate(value: DateInput): string | null {
  const date = toValidDate(value)
  return date ? accessDateFormat.format(date) : null
}

/**
 * "Saturday, October 3, 2026 at 11:30 PM UTC": a moment rather than a day, for
 * security notices. The zone is named so the reader can place it.
 */
export function formatMemberTimestamp(value: DateInput): string | null {
  const date = toValidDate(value)
  return date ? `${timestampFormat.format(date)} UTC` : null
}
