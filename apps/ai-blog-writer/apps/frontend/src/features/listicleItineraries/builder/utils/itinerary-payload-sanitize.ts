export { stripIdsDeep } from '../../../shared/builder/utils/strip-ids-deep.utils'

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
