/**
 * Price tier: how expensive a venue or tour is, on a four-step scale.
 *
 * Values are `'1'`-`'4'` and are never the dollar ticks they render as. Payload
 * derives GraphQL enum *member* names from an option's `value`, and `$` is not
 * a legal GraphQL name -- four `$`-valued options were enough to take the
 * entire `/api/graphql` schema build down with
 * `Names must start with [_a-zA-Z] but "$" does not`, so every GraphQL query
 * returned an empty 500 (diagnosed and fixed 2026-08-16). The ticks live in
 * `label`, which is presentation and never reaches a type name.
 *
 * Digits rather than words (`budget`, `luxury`) because the sibling
 * `priceLevel` selects on dining, nightlife, attractions and accommodations
 * already use exactly this encoding, and the client already renders it as
 * `'$'.repeat(n)`. One encoding per concept beats a second opinion.
 */

export const PRICE_TIER_VALUES = ['1', '2', '3', '4'] as const

export type PriceTier = (typeof PRICE_TIER_VALUES)[number]

export const priceTierOptions: { label: string; value: PriceTier }[] = [
  { label: '$', value: '1' },
  { label: '$$', value: '2' },
  { label: '$$$', value: '3' },
  { label: '$$$$', value: '4' },
]

/**
 * The encoding this field used before the GraphQL fix.
 *
 * Location Manager still sends ticks in its accommodations profile payload and
 * is a separate app on its own deploy cadence, so the tick spelling stays a
 * supported *input* indefinitely -- it is the sync contract. It is simply not
 * what we store.
 */
const LEGACY_TICKS: Record<string, PriceTier> = {
  $: '1',
  $$: '2',
  $$$: '3',
  $$$$: '4',
}

export function isPriceTier(value: unknown): value is PriceTier {
  return typeof value === 'string' && (PRICE_TIER_VALUES as readonly string[]).includes(value)
}

/**
 * Coerces an incoming price tier to the stored encoding.
 *
 * Returns the value untouched when it is neither a tier nor a legacy tick, so
 * a bad value still fails select validation loudly rather than being silently
 * swallowed into a wrong tier. Empty and nullish pass through as-is: the field
 * is optional.
 */
export function normalizePriceTier(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  return LEGACY_TICKS[trimmed] ?? value
}
