/**
 * Sample every named process directly, rather than polling a load balancer.
 *
 *   pnpm readiness:collect -- http://127.0.0.1:4100 http://127.0.0.1:4101
 *
 * Polling one load-balanced URL is not fleet observability. Ten samples can
 * be ten samples of the same process, and the saturated one is the least
 * likely to answer — so the picture is biased towards the healthy rather than
 * merely incomplete. This asks each process by address and says which ones
 * did not answer, which is the observation that actually matters.
 *
 * It also refuses to double-count. `backendsByState` is database-wide: every
 * instance reports the same number, so summing it across instances would
 * report a fleet several times larger than the database has. Per-process
 * pools and gates are summed; database-wide values are taken once and
 * reported with their disagreement, because two instances disagreeing about a
 * database-wide number means one of them has a stale sample.
 *
 * Counter resets are handled by reporting `startedAt` per instance: a
 * restarted process has a new identity and its counters start again, which is
 * correct and must not look like a drop.
 */

import { instanceIdentity } from '../../src/shared/observability/instance'

type Sample = {
  url: string
  ok: boolean
  error?: string
  body?: {
    instance?: ReturnType<typeof instanceIdentity>
    configFingerprint?: string
    payloadPool?: { total: number; idle: number; waiting: number }
    visitorAuthPool?: { total: number; idle: number; waiting: number } | null
    advisoryLockPool?: { total?: number; idle?: number; waiting?: number }
    admission?: Record<string, { active: number; queued: number; refused: Record<string, number> }>
    redis?: { state: string; opened: number; shortCircuited: number }
    refresh?: { worker?: { draining: boolean; lastSuccessAt: string | null }; backlog?: { pending: number; oldestPendingAgeS: number | null } | null }
    backendsByState?: Array<{ state: string; connections: number }>
    backendsAgeMs?: number
  }
}

const SECRET = process.env.DB_STATS_SECRET ?? ''

async function sample(url: string): Promise<Sample> {
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/api/internal/db-stats`, {
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return { url, ok: false, error: `HTTP ${response.status}` }
    return { url, ok: true, body: (await response.json()) as Sample['body'] }
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function sum(samples: Sample[], read: (body: NonNullable<Sample['body']>) => number): number {
  return samples.reduce((total, entry) => total + (entry.body ? read(entry.body) : 0), 0)
}

async function main(): Promise<void> {
  const urls = process.argv.slice(2).filter((arg) => arg.startsWith('http'))
  if (urls.length === 0) throw new Error('Usage: pnpm readiness:collect -- <url> [url...]')

  const samples = await Promise.all(urls.map(sample))
  const answered = samples.filter((entry) => entry.ok)
  const missing = samples.filter((entry) => !entry.ok)

  // Two processes reporting the same id means one URL is reaching the other,
  // which makes every per-process sum wrong.
  const ids = answered.map((entry) => entry.body?.instance?.id).filter(Boolean)
  const duplicated = ids.length !== new Set(ids).size

  const fingerprints = new Set(answered.map((entry) => entry.body?.configFingerprint))

  const backendTotals = answered
    .map((entry) => (entry.body?.backendsByState ?? []).reduce((total, row) => total + row.connections, 0))
    .filter((value) => Number.isFinite(value))

  const report = {
    takenAt: new Date().toISOString(),
    asked: urls.length,
    answered: answered.length,
    missing: missing.map((entry) => ({ url: entry.url, error: entry.error })),
    /** Two processes answering as one identity invalidates every sum below. */
    duplicateIdentities: duplicated,
    /** More than one means a rolling deploy, or a deploy that went wrong. */
    configurations: [...fingerprints],
    instances: answered.map((entry) => ({
      url: entry.url,
      id: entry.body?.instance?.id,
      pid: entry.body?.instance?.pid,
      role: entry.body?.instance?.role,
      release: entry.body?.instance?.release,
      // A new startedAt is a restart: counters starting again is correct and
      // must not be read as a drop.
      startedAt: entry.body?.instance?.startedAt,
      payloadWaiting: entry.body?.payloadPool?.waiting ?? 0,
      sessionWaiting: entry.body?.visitorAuthPool?.waiting ?? 0,
      redis: entry.body?.redis?.state,
      draining: entry.body?.refresh?.worker?.draining,
    })),
    perProcessSums: {
      payloadOpen: sum(answered, (body) => body.payloadPool?.total ?? 0),
      payloadWaiting: sum(answered, (body) => body.payloadPool?.waiting ?? 0),
      sessionOpen: sum(answered, (body) => body.visitorAuthPool?.total ?? 0),
      advisoryLockOpen: sum(answered, (body) => body.advisoryLockPool?.total ?? 0),
      assemblyActive: sum(answered, (body) => body.admission?.assembly?.active ?? 0),
      queryActive: sum(answered, (body) => body.admission?.query?.active ?? 0),
      ingressQueued: sum(answered, (body) => body.admission?.ingress?.queued ?? 0),
    },
    databaseWide: {
      // Taken once, not summed: every instance reports the same number.
      backends: backendTotals[0] ?? null,
      // Disagreement means a stale sample somewhere, not a bigger fleet.
      disagreement: new Set(backendTotals).size > 1 ? backendTotals : null,
      oldestPendingRefreshS: Math.max(
        ...answered.map((entry) => entry.body?.refresh?.backlog?.oldestPendingAgeS ?? 0),
        0,
      ),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (missing.length > 0) {
    console.error(`\n${missing.length} of ${urls.length} processes did not answer. A fleet average would have hidden that.`)
    process.exitCode = 2
  }
  if (duplicated) {
    console.error('\nTwo URLs answered with the same instance id. Every per-process sum above is wrong.')
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
