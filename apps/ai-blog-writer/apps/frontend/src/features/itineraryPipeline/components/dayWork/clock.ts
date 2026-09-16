/**
 * Minutes after the day's own midnight, read back as a clock.
 *
 * The contract carries integers rather than "09:30" so that arithmetic is
 * possible and a timezone question is impossible. A value over 1440 is the
 * next morning, which is how a nightlife stop at half past midnight is stored
 * without the day pretending to start over.
 */
export function clockOf(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const nextDay = minutes >= 1440
  const within = minutes % 1440
  const hours = String(Math.floor(within / 60)).padStart(2, '0')
  const rest = String(within % 60).padStart(2, '0')
  return `${hours}:${rest}${nextDay ? '⁺¹' : ''}`
}

/** A duration said the way a person would say it. */
export function durationOf(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}
