/**
 * Postgres stores Payload blocks/array rows with a shared hidden `id` (ObjectId hex).
 * Client-supplied ids (Lexical nodes, copied Payload rows) must not reach insert —
 * they collide and yield ValidationError path `id`, "Value must be unique".
 */

function stripIdsDeep(value: unknown): unknown {
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

function sanitizeBlockRow(row: Record<string, unknown>): void {
  delete row.id
  if (row.blurb !== undefined) {
    row.blurb = stripIdsDeep(row.blurb)
  }
  const kls = row.keyLocations
  if (Array.isArray(kls)) {
    for (const kl of kls) {
      if (kl && typeof kl === 'object') {
        delete (kl as Record<string, unknown>).id
      }
    }
  }
}

function sanitizeBlockList(rows: unknown): void {
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    if (row && typeof row === 'object') {
      sanitizeBlockRow(row as Record<string, unknown>)
    }
  }
}

function sanitizeItineraryDayRows(days: unknown): void {
  if (!Array.isArray(days)) return
  for (const day of days) {
    if (!day || typeof day !== 'object') continue
    const d = day as Record<string, unknown>
    delete d.id
    sanitizeBlockList(d.whereStaying)
    sanitizeBlockList(d.items)
  }
}

/**
 * Mutates `data` in place. Safe for create/update: Payload regenerates row ids.
 */
export function sanitizeListicleItineraryIncomingIds(
  data: Record<string, unknown> | undefined,
): void {
  if (!data) return

  const header = data.header
  if (header && typeof header === 'object') {
    const h = header as Record<string, unknown>
    if (h.intro !== undefined) {
      h.intro = stripIdsDeep(h.intro)
    }
  }

  sanitizeItineraryDayRows(data.itineraryDays)
  sanitizeBlockList(data.whereStaying)
  sanitizeBlockList(data.items)
}
