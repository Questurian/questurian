import type { DurationMinute, Meridiem, QuarterMinute } from '../../types'

export function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

export function normalizeQuarterMinute(value: unknown): QuarterMinute {
  if (value === '00' || value === '15' || value === '30' || value === '45') return value
  return '00'
}

export function normalizeDurationMinute(value: unknown): DurationMinute {
  if (value === '0' || value === '15' || value === '30' || value === '45') return value
  return '0'
}

export function normalizePeriod(value: unknown): Meridiem {
  if (value === 'AM' || value === 'PM') return value
  return 'AM'
}
