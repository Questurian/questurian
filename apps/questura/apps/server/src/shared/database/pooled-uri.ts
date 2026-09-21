/**
 * Does this connection string point at a transaction pooler?
 *
 * Session-level advisory locks do not survive transaction pooling: the lock is
 * taken on whichever backend served that transaction and released against
 * whichever serves the next, or not at all. `withAdvisoryLock` is what keeps
 * two concurrent Stripe webhooks for one customer from both reading the same
 * before-state, both writing, and both sending the same email — so this is a
 * correctness question, not a performance one, and it fails silently.
 *
 * The signals are the ones the managed providers actually use. This is a
 * heuristic and it is deliberately one-sided: a false positive asks an
 * operator to name a direct URI they may not need, and a false negative is a
 * payment bug nobody sees. Erring towards asking is the cheap mistake.
 */

const POOLER_HOST_MARKERS = [
  // Neon's pooled endpoint.
  '-pooler.',
  // Supabase's pooler hostnames.
  'pooler.supabase',
  // A PgBouncer sidecar, however it is named.
  'pgbouncer',
]

export function looksTransactionPooled(uri: string): boolean {
  if (!uri.trim()) return false

  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }

  const host = parsed.hostname.toLowerCase()
  if (POOLER_HOST_MARKERS.some((marker) => host.includes(marker))) return true

  // `?pgbouncer=true` is how Prisma-shaped connection strings declare it, and
  // the convention has spread past Prisma.
  const flag = parsed.searchParams.get('pgbouncer')?.toLowerCase()
  if (flag === 'true' || flag === '1') return true

  // Supabase's transaction pooler listens on 6543; 5432 is the direct port.
  if (parsed.port === '6543') return true

  return false
}
