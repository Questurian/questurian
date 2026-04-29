/**
 * Payload Postgres stores blocks/array rows in tables where each row's hidden `id`
 * (ObjectId hex string) is a primary key shared across collections. Client-supplied
 * or Lexical-embedded `id` values that duplicate existing rows → ValidationError
 * path `id`, "Value must be unique".
 */

export function stripIdsDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stripIdsDeep)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      if (k === 'id') continue
      next[k] = stripIdsDeep(v)
    }
    return next
  }
  return value
}

export function stripNestedRowIdsFromItineraryDays(itineraryDays: unknown): void {
  if (!Array.isArray(itineraryDays)) return
  for (const day of itineraryDays) {
    if (!day || typeof day !== 'object') continue
    const d = day as Record<string, unknown>
    delete d.id
    for (const key of ['whereStaying', 'items'] as const) {
      const rows = d[key]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        delete r.id
        const kls = r.keyLocations
        if (Array.isArray(kls)) {
          for (const kl of kls) {
            if (kl && typeof kl === 'object') delete (kl as Record<string, unknown>).id
          }
        }
      }
    }
  }
}
