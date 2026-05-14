export function normalizeCurrencyCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function normalizeIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string') return ''
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString()
}
